using System.Security.Cryptography;

namespace BorisType.FileSystem;

/// <summary>Bounded UTF-8 file operations with versioned JSON results and errors, independent of Datex.</summary>
public static partial class Files
{
    /// <summary>Reads text, stripping one UTF-8 BOM, and reports the original byte hash.</summary>
    /// <param name="physicalPath">Absolute physical file path resolved by the caller.</param>
    /// <param name="requestJson">Optional 1-based inclusive startLine/endLine.</param>
    /// <returns>JSON containing API version, content, SHA256 and BOM, or an error.</returns>
    public static string ReadJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        var request = FileJson.Parse<ReadFileRequest>(requestJson);
        var data = FileIo.Read(FileIo.PathFor(physicalPath));
        return FileJson.Serialize(TextCoverage.Slice(data, request));
    });

    /// <summary>Creates or replaces a file using UTF-8 with BOM and same-directory temporary replacement.</summary>
    /// <param name="physicalPath">Absolute physical path; parent must exist.</param>
    /// <param name="requestJson">JSON options containing string content.</param>
    /// <returns>JSON byte count and hash, or an error.</returns>
    public static string WriteJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        var request = FileJson.Parse<WriteFileRequest>(requestJson);
        request.Validate();
        byte[] bytes = FileIo.Encode(request.Content, bom: true);
        lock (FileIo.MutationLock)
        {
            string path = FileIo.PathFor(physicalPath, allowMissing: request.Mode == "create");
            FileIo.Writable(path);
            if (request.Mode == "create" && File.Exists(path)) throw new FileProblem("AlreadyExists", "Create does not overwrite an existing file.");
            var original = request.Mode == "overwrite" ? FileIo.Read(path) : null;
            if (original is not null && !string.Equals(original.Sha256, request.ExpectedSha256, StringComparison.OrdinalIgnoreCase))
                throw new FileProblem("Conflict", "File does not match expectedSha256.");
            string result = FileJson.Serialize(new { apiVersion = 2, bytesWritten = bytes.Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(bytes)) });
            FileIo.Replace(path, bytes, original is null ? null : () =>
            {
                if (!original.Bytes.AsSpan().SequenceEqual(FileIo.Read(path).Bytes)) throw new FileProblem("Conflict", "File changed before commit.");
            }, overwrite: request.Mode == "overwrite");
            return result;
        }
    });

    /// <summary>Lists at most 10000 immediate entries in ordinal order; marks links without traversing them.</summary>
    /// <param name="physicalPath">Absolute physical directory path.</param>
    /// <param name="requestJson">Empty JSON options object.</param>
    /// <returns>JSON entries, or an error; never a silently truncated listing.</returns>
    public static string ListJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        FileJson.Parse<EmptyFileRequest>(requestJson);
        string path = FileIo.PathFor(physicalPath, directory: true);
        var entries = new List<FileEntry>();
        var options = new EnumerationOptions { AttributesToSkip = 0, IgnoreInaccessible = false };
        foreach (var entry in new DirectoryInfo(path).EnumerateFileSystemInfos("*", options))
        {
            if (entries.Count >= 10000) throw new FileProblem("LimitExceeded", "Directory contains more than 10000 entries; use a narrower root or search.");
            var attributes = entry.Attributes;
            entries.Add(new FileEntry(entry.Name, (attributes & FileAttributes.Directory) != 0,
                (attributes & FileAttributes.ReparsePoint) != 0 ? true : null));
        }
        entries.Sort((a, b) => string.CompareOrdinal(a.Name, b.Name));
        return FileJson.Serialize(new { apiVersion = 2, entries });
    });

    /// <summary>Deletes one existing file. Directories and links are rejected.</summary>
    /// <param name="physicalPath">Absolute physical file path.</param>
    /// <param name="requestJson">Empty JSON options object.</param>
    /// <returns>JSON confirmation, or an error.</returns>
    public static string DeleteJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        FileJson.Parse<EmptyFileRequest>(requestJson);
        lock (FileIo.MutationLock)
        {
            string path = FileIo.PathFor(physicalPath);
            FileIo.Writable(path);
            string result = FileJson.Serialize(new { apiVersion = 2, deleted = true });
            File.Delete(path);
            return result;
        }
    });

    /// <summary>Applies unique exact replacements within previously read ranges and a required byte-hash precondition.</summary>
    /// <param name="physicalPath">Absolute physical file path.</param>
    /// <param name="requestJson">JSON edits, expectedSha256, allowedRanges and optional dryRun.</param>
    /// <returns>JSON status/hashes and preview content when requested, or an error with optional editIndex.</returns>
    public static string EditJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        var request = FileJson.Parse<EditFileRequest>(requestJson);
        request.Validate();
        lock (FileIo.MutationLock)
        {
            string path = FileIo.PathFor(physicalPath);
            var original = FileIo.Read(path);
            if (!string.Equals(original.Sha256, request.ExpectedSha256, StringComparison.OrdinalIgnoreCase))
                throw new FileProblem("Conflict", "File does not match expectedSha256.");
            var ranges = TextCoverage.Validate(request.AllowedRanges!, original.Content.Length);
            string content = original.Content;
            int index = 0;
            foreach (var edit in request.Edits!)
            {
                index++;
                int first = content.IndexOf(edit.OldText!, StringComparison.Ordinal);
                if (first < 0) throw new FileProblem("EditNotFound", "oldText was not found.", index);
                if (content.IndexOf(edit.OldText!, first + 1, StringComparison.Ordinal) >= 0)
                    throw new FileProblem("EditAmbiguous", "oldText occurs more than once.", index);
                TextCoverage.Apply(ranges, first, first + edit.OldText!.Length, edit.NewText!.Length, index);
                content = string.Concat(content.AsSpan(0, first), edit.NewText, content.AsSpan(first + edit.OldText!.Length));
                // Bound intermediate results too; later edits must not inflate memory without limit.
                FileIo.Encode(content, original.Bom);
            }
            byte[] updated = FileIo.Encode(content, original.Bom);
            bool unchanged = original.Bytes.AsSpan().SequenceEqual(updated);
            string result = FileJson.Serialize(new { apiVersion = 2, status = request.DryRun ? "dry_run" : unchanged ? "unchanged" : "applied",
                editsCount = request.Edits!.Length, previousSha256 = original.Sha256, sha256 = Convert.ToHexStringLower(SHA256.HashData(updated)),
                content = request.DryRun ? content : null });
            if (!request.DryRun && !unchanged)
                FileIo.Replace(path, updated, () =>
                {
                    if (!original.Bytes.AsSpan().SequenceEqual(FileIo.Read(path).Bytes))
                        throw new FileProblem("Conflict", "File changed before commit.");
                });
            return result;
        }
    });
}

internal sealed record FileEntry(string Name, bool IsDirectory, bool? IsSymbolicLink);
