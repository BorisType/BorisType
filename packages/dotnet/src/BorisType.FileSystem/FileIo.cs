using System.Security.Cryptography;
using System.Text;

namespace BorisType.FileSystem;

internal sealed record TextSnapshot(byte[] Bytes, string Content, bool Bom)
{
    internal string Sha256 => Convert.ToHexStringLower(SHA256.HashData(Bytes));
}

internal static class FileIo
{
    internal static readonly object MutationLock = new();
    private static readonly UTF8Encoding Utf8 = new(false, true);

    internal static string PathFor(string path, bool? directory = false, bool allowMissing = false)
    {
        if (string.IsNullOrEmpty(path) || !Path.IsPathFullyQualified(path))
            throw new FileProblem("InvalidPath", "Expected a fully qualified physical path.");
        string full;
        try { full = Path.GetFullPath(path); }
        catch (ArgumentException) { throw new FileProblem("InvalidPath", "Invalid physical path."); }
        for (DirectoryInfo? parent = Directory.GetParent(full); parent is not null; parent = parent.Parent)
        {
            try { RejectLink(File.GetAttributes(parent.FullName)); }
            catch (FileNotFoundException) { throw new DirectoryNotFoundException(); }
        }
        FileAttributes attributes;
        try { attributes = File.GetAttributes(full); }
        catch (FileNotFoundException) when (allowMissing) { return full; }
        RejectLink(attributes);
        bool isDirectory = (attributes & FileAttributes.Directory) != 0;
        if (directory.HasValue && directory.Value != isDirectory)
            throw new FileProblem(directory.Value ? "NotADirectory" : "NotAFile", directory.Value ? "Expected a directory." : "Expected a file.");
        return full;
    }

    private static void RejectLink(FileAttributes attributes)
    {
        if ((attributes & FileAttributes.ReparsePoint) != 0)
            throw new FileProblem("LinkNotAllowed", "File paths and their ancestors must not be symbolic links or junctions.");
    }

    internal static TextSnapshot Read(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        if (stream.Length > FileJson.MaxTextBytes) throw new FileProblem("LimitExceeded", "Text file exceeds 1 MiB.");
        byte[] bytes = new byte[FileJson.MaxTextBytes + 1];
        int count = 0;
        while (count < bytes.Length)
        {
            int read = stream.Read(bytes, count, Math.Min(8192, bytes.Length - count));
            if (read == 0) break;
            count += read;
        }
        if (count > FileJson.MaxTextBytes) throw new FileProblem("LimitExceeded", "Text file exceeds 1 MiB.");
        Array.Resize(ref bytes, count);
        if (bytes.Contains((byte)0)) throw new FileProblem("BinaryFile", "NUL bytes are not supported by text operations.");
        bool bom = bytes.AsSpan().StartsWith<byte>([0xef, 0xbb, 0xbf]);
        return new TextSnapshot(bytes, Utf8.GetString(bytes.AsSpan(bom ? 3 : 0)), bom);
    }

    internal static byte[] Encode(string? content, bool bom)
    {
        if (content is null || content.Contains('\0')) throw new FileProblem("InvalidRequest", "Expected string content without NUL.");
        int length;
        try { length = Utf8.GetByteCount(content); }
        catch (EncoderFallbackException) { throw new FileProblem("InvalidRequest", "Text contains invalid UTF-16."); }
        if (length + (bom ? 3 : 0) > FileJson.MaxTextBytes) throw new FileProblem("LimitExceeded", "Text file exceeds 1 MiB.");
        byte[] bytes = new byte[length + (bom ? 3 : 0)];
        if (bom) { bytes[0] = 0xef; bytes[1] = 0xbb; bytes[2] = 0xbf; }
        Utf8.GetBytes(content, bytes.AsSpan(bom ? 3 : 0));
        return bytes;
    }

    internal static void Writable(string path)
    {
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReadOnly) != 0)
            throw new FileProblem("AccessDenied", "Readonly file cannot be modified.");
    }

    internal static void Replace(string path, byte[] bytes, Action? beforeCommit = null, bool overwrite = true)
    {
        Writable(path);
        UnixFileMode? mode = !OperatingSystem.IsWindows() && File.Exists(path) ? File.GetUnixFileMode(path) & (UnixFileMode)0x1ff : null;
        string temporary = Path.Combine(Path.GetDirectoryName(path)!, ".boristype-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None };
            if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            using (var stream = new FileStream(temporary, options))
            {
                stream.Write(bytes);
                stream.Flush(flushToDisk: true);
            }
            if (!OperatingSystem.IsWindows() && mode.HasValue) File.SetUnixFileMode(temporary, mode.Value);
            // Revalidate the path and original snapshot as close to rename as possible.
            PathFor(path, allowMissing: true);
            Writable(path);
            beforeCommit?.Invoke();
            try { File.Move(temporary, path, overwrite); }
            catch (IOException) when (!overwrite && (File.Exists(path) || Directory.Exists(path)))
            { throw new FileProblem("AlreadyExists", "Create does not overwrite an existing destination."); }
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
