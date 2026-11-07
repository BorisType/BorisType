using System.Text.Json;
using Xunit;

namespace BorisType.FileSystem.Tests;

public class WorkspaceFilesTests
{
    private static JsonDocument Run(string method, string path, object request)
    {
        var entry = typeof(Files).GetMethod(method);
        Assert.NotNull(entry);
        return JsonDocument.Parse((string)entry.Invoke(null, [path, JsonSerializer.Serialize(request)])!);
    }
    private static void Success(JsonDocument result) => Assert.False(result.RootElement.TryGetProperty("error", out _), result.RootElement.GetRawText());
    private static void Error(JsonDocument result, string code) => Assert.Equal(code, result.RootElement.GetProperty("error").GetProperty("code").GetString());

    [Fact]
    public void Directory_creation_creates_parents_and_is_idempotent()
    {
        using var tree = new TemporaryTree();
        string path = Path.Combine(tree.Root, "new", "nested");
        using var first = Run("CreateDirectoryJson", path, new { });
        Success(first); Assert.True(Directory.Exists(path));
        Assert.True(first.RootElement.GetProperty("created").GetBoolean());
        using var second = Run("CreateDirectoryJson", path, new { });
        Success(second); Assert.False(second.RootElement.GetProperty("created").GetBoolean());
    }

    [Fact]
    public void Directory_creation_does_not_replace_a_file_or_follow_a_link()
    {
        using var tree = new TemporaryTree();
        string file = tree.Write("file", "keep");
        using var exists = Run("CreateDirectoryJson", file, new { });
        Error(exists, "NotADirectory");
        Directory.CreateSymbolicLink(Path.Combine(tree.Root, "alias"), tree.Root);
        using var link = Run("CreateDirectoryJson", Path.Combine(tree.Root, "alias", "new"), new { });
        Error(link, "LinkNotAllowed"); Assert.False(Directory.Exists(Path.Combine(tree.Root, "new")));
        Assert.Equal("keep", File.ReadAllText(file));
    }

    [Fact]
    public void Info_reads_metadata_of_large_binary_files_and_directories_without_text_decoding()
    {
        using var tree = new TemporaryTree();
        byte[] bytes = new byte[1048577]; bytes[0] = 0xff;
        string path = tree.WriteBytes("binary.dat", bytes);
        File.SetLastWriteTimeUtc(path, new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc));
        using var file = Run("InfoJson", path, new { });
        Success(file); Assert.Equal("binary.dat", file.RootElement.GetProperty("name").GetString());
        Assert.Equal(1048577, file.RootElement.GetProperty("sizeBytes").GetInt64());
        Assert.False(file.RootElement.GetProperty("isDirectory").GetBoolean());
        Assert.Equal("2020-01-02T03:04:05Z", file.RootElement.GetProperty("modifiedUtc").GetString());
        using var directory = Run("InfoJson", tree.Root, new { });
        Success(directory); Assert.True(directory.RootElement.GetProperty("isDirectory").GetBoolean());
        Assert.False(directory.RootElement.TryGetProperty("sizeBytes", out _));
        Assert.False(file.RootElement.TryGetProperty("readToken", out _));
    }

    [Fact]
    public void Move_renames_binary_bytes_without_reading_or_reencoding_them()
    {
        using var tree = new TemporaryTree();
        byte[] bytes = [0xff, 0, 0xef, 0xbb, 0xbf, 10, 13];
        string source = tree.WriteBytes("source", bytes);
        Directory.CreateDirectory(Path.Combine(tree.Root, "folder"));
        string destination = Path.Combine(tree.Root, "folder", "Привет ' $&.bin");
        using var result = Run("MoveJson", source, new { destination });
        Success(result); Assert.True(result.RootElement.GetProperty("moved").GetBoolean());
        Assert.False(File.Exists(source)); Assert.Equal(bytes, File.ReadAllBytes(destination));
    }

    [Fact]
    public void Move_never_overwrites_a_destination_or_copies_on_error()
    {
        using var tree = new TemporaryTree();
        string source = tree.Write("source", "keep source");
        string destination = tree.Write("target", "keep destination");
        using var result = Run("MoveJson", source, new { destination });
        Error(result, "AlreadyExists");
        Assert.Equal("keep source", File.ReadAllText(source)); Assert.Equal("keep destination", File.ReadAllText(destination));
        using var same = Run("MoveJson", source, new { destination = source });
        Error(same, "AlreadyExists");
        using var parent = Run("MoveJson", source, new { destination = Path.Combine(tree.Root, "missing", "target") });
        Error(parent, "DirectoryNotFound"); Assert.Equal(2, Directory.GetFileSystemEntries(tree.Root).Length);
    }

    [Theory]
    [InlineData("InfoJson")]
    [InlineData("MoveJson")]
    [InlineData("CreateDirectoryJson")]
    public void Workspace_operations_reject_link_ancestors_and_unknown_options(string method)
    {
        using var tree = new TemporaryTree();
        tree.Write("dir/file", "keep");
        Directory.CreateSymbolicLink(Path.Combine(tree.Root, "alias"), Path.Combine(tree.Root, "dir"));
        object request = method == "MoveJson" ? new { destination = Path.Combine(tree.Root, "target") } : new { };
        using var link = Run(method, Path.Combine(tree.Root, "alias", "file"), request);
        Error(link, "LinkNotAllowed");
        using var unknown = Run(method, tree.Root, new { unknown = true });
        Error(unknown, "InvalidRequest");
    }

    [Fact]
    public void Move_rejects_cross_filesystem_instead_of_falling_back_to_copy_delete()
    {
        if (!OperatingSystem.IsLinux() || !Directory.Exists("/dev/shm")) return;
        using var tree = new TemporaryTree();
        string source = tree.Write("source", "keep");
        string destination = Path.Combine("/dev/shm", "boristype-move-" + Guid.NewGuid().ToString("N"));
        try
        {
            using var result = Run("MoveJson", source, new { destination });
            Error(result, "CrossDevice"); Assert.Equal("keep", File.ReadAllText(source)); Assert.False(File.Exists(destination));
        }
        finally { File.Delete(destination); }
    }
}
