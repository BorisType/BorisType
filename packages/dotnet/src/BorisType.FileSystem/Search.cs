using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace BorisType.FileSystem;

/// <summary>Searches ordinary filesystem trees using a bounded JSON interface.</summary>
public static class Search
{
    /// <summary>Searches a physical directory with glob filters and optional line content matching.</summary>
    /// <param name="rootPath">Fully qualified directory path resolved by the caller.</param>
    /// <param name="requestJson">Search options as a JSON object.</param>
    /// <returns>JSON matches, work counters, skipped counts and any limit reason.</returns>
    public static string FindJson(string rootPath, string requestJson) => FindJsonWithCancellation(rootPath, requestJson, CancellationToken.None);

    /// <summary>Searches with cooperative managed cancellation between filesystem and matching operations.</summary>
    /// <param name="rootPath">Fully qualified directory path resolved by the caller.</param>
    /// <param name="requestJson">Search options as a JSON object.</param>
    /// <param name="cancellationToken">Cancellation does not guarantee interruption of blocked filesystem calls.</param>
    /// <returns>JSON matches and coverage counters.</returns>
    public static string FindJsonWithCancellation(string rootPath, string requestJson, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var worker = new SearchWorker(SearchRequest.Parse(requestJson), cancellationToken);
        return worker.Run(rootPath);
    }
}

internal sealed class SearchWorker
{
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    private readonly SearchRequest request;
    private readonly CancellationToken cancellation;
    private readonly GlobPattern include;
    private readonly GlobPattern[] exclude;
    private readonly Regex? contentRegex;
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly SearchResponse response = new();
    private int outputBytes;

    internal SearchWorker(SearchRequest request, CancellationToken cancellation)
    {
        this.request = request;
        this.cancellation = cancellation;
        include = new GlobPattern(request.Pattern);
        exclude = request.ExcludePatterns.Select(pattern => new GlobPattern(pattern)).ToArray();
        if (request.Regex)
            contentRegex = new Regex(request.Query!, RegexOptions.CultureInvariant | (request.IgnoreCase ? RegexOptions.IgnoreCase : RegexOptions.None),
                TimeSpan.FromMilliseconds(50));
    }

    internal string Run(string rootPath)
    {
        if (string.IsNullOrEmpty(rootPath) || !Path.IsPathFullyQualified(rootPath))
            throw new ArgumentException("Search root must be a fully qualified physical directory path.", nameof(rootPath));
        var root = new DirectoryInfo(Path.GetFullPath(rootPath));
        if (!root.Exists) throw new DirectoryNotFoundException("Search root directory does not exist.");
        for (DirectoryInfo? ancestor = root; ancestor is not null; ancestor = ancestor.Parent)
            if ((ancestor.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new ArgumentException("Search root and its ancestors must not be symbolic links or junctions.", nameof(rootPath));

        Walk(root);
        response.Matches.Sort((left, right) =>
        {
            int path = string.CompareOrdinal(left.Path, right.Path);
            return path == 0 ? Nullable.Compare(left.Line, right.Line) : path;
        });
        return JsonSerializer.Serialize(response, SearchRequest.Json);
    }

    private bool Stop()
    {
        cancellation.ThrowIfCancellationRequested();
        if (response.LimitReason is not null) return true;
        if (clock.ElapsedMilliseconds < request.TimeoutMs) return false;
        response.LimitReason = "time";
        return true;
    }

    private void Walk(DirectoryInfo root)
    {
        var stack = new Stack<(IEnumerator<FileSystemInfo> Iterator, int Depth)>();
        var options = new EnumerationOptions { AttributesToSkip = 0, IgnoreInaccessible = false, RecurseSubdirectories = false };
        stack.Push((root.EnumerateFileSystemInfos("*", options).GetEnumerator(), 0));
        try
        {
            while (stack.Count != 0 && !Stop())
            {
                if (response.Stats.VisitedEntries >= request.MaxEntries)
                {
                    response.LimitReason = "entries";
                    break;
                }
                var frame = stack.Peek();
                FileSystemInfo entry;
                try
                {
                    if (!frame.Iterator.MoveNext())
                    {
                        stack.Pop().Iterator.Dispose();
                        continue;
                    }
                    entry = frame.Iterator.Current;
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException)
                {
                    if (frame.Depth == 0) throw;
                    response.Skipped.IoErrors++;
                    stack.Pop().Iterator.Dispose();
                    continue;
                }
                response.Stats.VisitedEntries++;
                try
                {
                    if ((entry.Attributes & FileAttributes.ReparsePoint) != 0)
                    {
                        response.Skipped.Links++;
                        continue;
                    }
                    string relative = Path.GetRelativePath(root.FullName, entry.FullName).Replace(Path.DirectorySeparatorChar, '/');
                    if (entry is DirectoryInfo directory)
                    {
                        if (exclude.Any(pattern => pattern.ExcludesDirectory(relative))) continue;
                        if (frame.Depth >= request.MaxDepth) response.Skipped.Depth++;
                        else stack.Push((directory.EnumerateFileSystemInfos("*", options).GetEnumerator(), frame.Depth + 1));
                    }
                    else if (include.Matches(relative) && !exclude.Any(pattern => pattern.Matches(relative)))
                    {
                        if (request.Query is null) Add(new SearchMatch(relative));
                        else ReadFile(entry.FullName, relative);
                    }
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException)
                {
                    response.Skipped.IoErrors++;
                }
            }
        }
        finally
        {
            while (stack.TryPop(out var frame)) frame.Iterator.Dispose();
        }
    }

    private void ReadFile(string path, string relative)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 8192, FileOptions.SequentialScan);
        if (stream.Length > request.MaxFileBytes)
        {
            response.Skipped.TooLarge++;
            return;
        }
        if (stream.Length > request.MaxTotalBytes - response.Stats.ReadBytes)
        {
            response.LimitReason = "bytes";
            return;
        }
        response.Stats.FilesRead++;
        using var bytes = new MemoryStream();
        byte[] block = new byte[8192];
        while (!Stop())
        {
            long remaining = request.MaxTotalBytes - response.Stats.ReadBytes;
            if (remaining == 0)
            {
                if (stream.Position < stream.Length) response.LimitReason = "bytes";
                break;
            }
            int length = (int)Math.Min(block.Length, Math.Min(remaining, request.MaxFileBytes + 1L - bytes.Length));
            int count = stream.Read(block, 0, length);
            if (count == 0) break;
            response.Stats.ReadBytes += count;
            bytes.Write(block, 0, count);
            if (bytes.Length > request.MaxFileBytes)
            {
                response.Skipped.TooLarge++;
                return;
            }
        }
        if (Stop()) return;
        ReadOnlySpan<byte> data = bytes.GetBuffer().AsSpan(0, (int)bytes.Length);
        if (data.Contains((byte)0))
        {
            response.Skipped.Binary++;
            return;
        }
        if (data.StartsWith<byte>([0xef, 0xbb, 0xbf])) data = data[3..];
        string text;
        try { text = Utf8.GetString(data); }
        catch (DecoderFallbackException)
        {
            response.Skipped.InvalidEncoding++;
            return;
        }
        using var lines = new StringReader(text);
        int number = 0;
        while (!Stop() && lines.ReadLine() is { } line)
        {
            number++;
            if (line.Length > request.MaxLineLength)
            {
                response.Skipped.LongLines++;
                continue;
            }
            int index;
            try
            {
                index = contentRegex is null
                    ? line.IndexOf(request.Query!, request.IgnoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal)
                    : contentRegex.Match(line) is { Success: true } match ? match.Index : -1;
            }
            catch (RegexMatchTimeoutException)
            {
                response.LimitReason = "regex";
                return;
            }
            if (index >= 0) Add(new SearchMatch(relative, number, index + 1, line));
        }
    }

    private void Add(SearchMatch match)
    {
        int size = JsonSerializer.SerializeToUtf8Bytes(match, SearchRequest.Json).Length + 1;
        if (outputBytes + size > 256000)
        {
            response.LimitReason = "output";
            return;
        }
        outputBytes += size;
        response.Matches.Add(match);
        if (response.Matches.Count >= request.MaxResults) response.LimitReason = "results";
    }
}
