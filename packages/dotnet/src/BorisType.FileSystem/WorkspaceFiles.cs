using System.Globalization;

namespace BorisType.FileSystem;

public static partial class Files
{
    /// <summary>Creates a directory and missing parents, rejecting existing files and link ancestors.</summary>
    /// <param name="physicalPath">Absolute physical directory path.</param>
    /// <param name="requestJson">Empty JSON options object.</param>
    /// <returns>Versioned JSON with created=false for an existing directory, or an error.</returns>
    public static string CreateDirectoryJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        FileJson.Parse<EmptyFileRequest>(requestJson);
        if (string.IsNullOrEmpty(physicalPath) || !Path.IsPathFullyQualified(physicalPath))
            throw new FileProblem("InvalidPath", "Expected an absolute directory path.");
        string path = Path.GetFullPath(physicalPath);
        lock (FileIo.MutationLock)
        {
            string ancestor = path;
            while (true)
            {
                try { File.GetAttributes(ancestor); break; }
                catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException)
                { ancestor = Directory.GetParent(ancestor)?.FullName ?? throw new DirectoryNotFoundException(); }
            }
            FileIo.PathFor(ancestor, directory: true);
            bool created = ancestor != path;
            string result = FileJson.Serialize(new { apiVersion = 2, created });
            Directory.CreateDirectory(path);
            FileIo.PathFor(path, directory: true);
            return result;
        }
    });

    /// <summary>Reports metadata for a regular file or directory without reading or decoding its contents.</summary>
    /// <param name="physicalPath">Absolute physical path; links and link ancestors are rejected.</param>
    /// <param name="requestJson">Empty JSON options object.</param>
    /// <returns>Versioned JSON name, type, optional file size and UTC modification time.</returns>
    public static string InfoJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        FileJson.Parse<EmptyFileRequest>(requestJson);
        string path = FileIo.PathFor(physicalPath, directory: null);
        bool isDirectory = (File.GetAttributes(path) & FileAttributes.Directory) != 0;
        FileSystemInfo info = isDirectory ? new DirectoryInfo(path) : new FileInfo(path);
        info.Refresh();
        if (!info.Exists) throw new FileNotFoundException();
        return FileJson.Serialize(new { apiVersion = 2, info.Name, isDirectory,
            sizeBytes = isDirectory ? (long?)null : ((FileInfo)info).Length,
            modifiedUtc = info.LastWriteTimeUtc.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", CultureInfo.InvariantCulture) });
    });

    /// <summary>Renames a file without overwriting or falling back to a cross-filesystem copy/delete.</summary>
    /// <param name="physicalPath">Absolute physical source file path.</param>
    /// <param name="requestJson">JSON destination containing an absolute physical target file path.</param>
    /// <returns>Versioned JSON confirmation, or an error. Supported on Linux and Windows.</returns>
    public static string MoveJson(string physicalPath, string requestJson) => FileJson.Execute(() =>
    {
        var request = FileJson.Parse<MoveFileRequest>(requestJson);
        lock (FileIo.MutationLock)
        {
            string source = FileIo.PathFor(physicalPath);
            string destination = FileIo.PathFor(request.Destination!, directory: null, allowMissing: true);
            FileIo.Writable(source);
            if (File.Exists(destination) || Directory.Exists(destination)) throw new FileProblem("AlreadyExists", "Destination already exists.");
            string result = FileJson.Serialize(new { apiVersion = 2, moved = true });
            FileMove.Rename(source, destination);
            return result;
        }
    });
}

internal sealed record MoveFileRequest
{
    public string? Destination { get; init; }
}
