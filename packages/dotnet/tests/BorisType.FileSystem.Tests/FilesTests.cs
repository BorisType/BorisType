using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace BorisType.FileSystem.Tests;

public class FilesTests
{
    private static JsonDocument Run(string method, string path, object options)
    {
        Type? type = Assembly.Load("BorisType.FileSystem").GetType("BorisType.FileSystem.Files");
        Assert.NotNull(type);
        MethodInfo? entry = type.GetMethod(method, BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(entry);
        Assert.Equal(typeof(string), entry.ReturnType);
        // These legacy IO cases use a full read snapshot; missing preconditions
        // and partial coverage are exercised independently by ReadAwareTests.
        var request = JsonSerializer.SerializeToNode(options)!.AsObject();
        if (method is "EditJson" or "WriteJson")
        {
            byte[] bytes = File.Exists(path) ? File.ReadAllBytes(path) : [];
            if (method == "WriteJson") request["mode"] = File.Exists(path) ? "overwrite" : "create";
            if ((method == "EditJson" || File.Exists(path)) && !request.ContainsKey("expectedSha256"))
                request["expectedSha256"] = Convert.ToHexStringLower(SHA256.HashData(bytes));
            if (method == "EditJson" && !request.ContainsKey("allowedRanges"))
                request["allowedRanges"] = JsonSerializer.SerializeToNode(new[] { new { start = 0, end = File.Exists(path) ? File.ReadAllText(path).Length : 0 } });
        }
        string json = Assert.IsType<string>(entry.Invoke(null, [path, request.ToJsonString()]));
        var result = JsonDocument.Parse(json);
        Assert.Equal(2, result.RootElement.GetProperty("apiVersion").GetInt32());
        return result;
    }

    private static void Error(JsonDocument result, string code)
    {
        Assert.True(result.RootElement.TryGetProperty("error", out var error), result.RootElement.GetRawText());
        Assert.Equal(code, error.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Read_preserves_exact_text_and_reports_the_original_byte_hash(bool bom)
    {
        using var tree = new TemporaryTree();
        string text = "Привет\r\nabc\rtail\n  \t";
        byte[] bytes = Encoding.UTF8.GetBytes((bom ? "\uFEFF" : "") + text);
        string path = tree.WriteBytes("data", bytes);
        using var read = Run("ReadJson", path, new { });
        Assert.Equal(bom, read.RootElement.GetProperty("bom").GetBoolean());
        Assert.Equal(text, read.RootElement.GetProperty("content").GetString());
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(bytes)), read.RootElement.GetProperty("sha256").GetString());
    }

    [Fact]
    public void Read_removes_exactly_one_BOM_and_preserves_a_second_signature_as_content()
    {
        using var tree = new TemporaryTree();
        using var result = Run("ReadJson", tree.Write("double", "\uFEFF\uFEFFabc"), new { });
        Assert.Equal("\uFEFFabc", result.RootElement.GetProperty("content").GetString());
    }

    [Fact]
    public void Read_empty_and_known_SHA256_are_not_coerced_or_reencoded()
    {
        using var tree = new TemporaryTree();
        using var empty = Run("ReadJson", tree.Write("empty", ""), new { });
        Assert.Equal("", empty.RootElement.GetProperty("content").GetString());
        using var abc = Run("ReadJson", tree.Write("abc", "abc"), new { });
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", abc.RootElement.GetProperty("sha256").GetString());
    }

    [Theory]
    [InlineData("binary", "BinaryFile")]
    [InlineData("invalid", "InvalidEncoding")]
    [InlineData("large", "LimitExceeded")]
    public void Text_read_rejects_unsupported_data_without_returning_partial_content(string name, string code)
    {
        using var tree = new TemporaryTree();
        byte[] bytes = name switch { "binary" => [65, 0, 66], "invalid" => [0xff, 0xfe], _ => new byte[1048577] };
        using var result = Run("ReadJson", tree.WriteBytes(name, bytes), new { });
        Error(result, code);
        Assert.False(result.RootElement.TryGetProperty("content", out _));
    }

    [Theory]
    [InlineData("")]
    [InlineData("  Привет 👋\r\n' \\ ${request}\r\n")]
    public void Write_creates_then_atomically_overwrites_exact_UTF8_with_BOM(string content)
    {
        using var tree = new TemporaryTree();
        string path = Path.Combine(tree.Root, "new.txt");
        using var created = Run("WriteJson", path, new { content });
        byte[] expected = Encoding.UTF8.GetBytes("\uFEFF" + content);
        Assert.Equal(expected.Length, created.RootElement.GetProperty("bytesWritten").GetInt32());
        Assert.Equal(expected, File.ReadAllBytes(path));
        using var overwritten = Run("WriteJson", path, new { content = "short" });
        Assert.Equal(Encoding.UTF8.GetBytes("\uFEFFshort"), File.ReadAllBytes(path));
        Assert.Equal(["new.txt"], Directory.GetFileSystemEntries(tree.Root).Select(Path.GetFileName));
    }

    [Theory]
    [InlineData("ReadJson")]
    [InlineData("WriteJson")]
    [InlineData("DeleteJson")]
    [InlineData("EditJson")]
    public void File_operations_never_treat_directories_as_files(string method)
    {
        using var tree = new TemporaryTree();
        using var result = Run(method, tree.Root, Options(method));
        Error(result, "NotAFile");
        Assert.True(Directory.Exists(tree.Root));
    }

    private static object Options(string method) => method switch
    {
        "WriteJson" => new { content = "changed" },
        "EditJson" => new { edits = new[] { new { oldText = "a", newText = "b" } } },
        _ => new { },
    };

    [Theory]
    [InlineData("ReadJson")]
    [InlineData("WriteJson")]
    [InlineData("ListJson")]
    [InlineData("DeleteJson")]
    [InlineData("EditJson")]
    public void Relative_paths_and_unknown_request_fields_fail_before_IO(string method)
    {
        using var invalidPath = Run(method, "relative", Options(method));
        Error(invalidPath, "InvalidPath");
        using var unknown = Run(method, Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()), new { unknown = 1 });
        Error(unknown, "InvalidRequest");
    }

    [Fact]
    public void Write_requires_existing_parent_and_respects_readonly_files()
    {
        using var tree = new TemporaryTree();
        using var missing = Run("WriteJson", Path.Combine(tree.Root, "missing", "new"), new { content = "new" });
        Error(missing, "DirectoryNotFound");
        Assert.Empty(Directory.GetFileSystemEntries(tree.Root));
        string path = tree.Write("readonly", "original");
        File.SetAttributes(path, File.GetAttributes(path) | FileAttributes.ReadOnly);
        try
        {
            using var denied = Run("WriteJson", path, new { content = "new" });
            Error(denied, "AccessDenied");
            Assert.Equal("original", File.ReadAllText(path));
            Assert.Single(Directory.GetFileSystemEntries(tree.Root));
        }
        finally { File.SetAttributes(path, FileAttributes.Normal); }
    }

    [Fact]
    public void Replacement_preserves_Unix_rwx_permissions()
    {
        if (OperatingSystem.IsWindows()) return;
        using var tree = new TemporaryTree();
        string path = tree.Write("executable", "old");
        const UnixFileMode mode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute | UnixFileMode.GroupRead;
        File.SetUnixFileMode(path, mode);
        using var result = Run("WriteJson", path, new { content = "new" });
        Assert.False(result.RootElement.TryGetProperty("error", out _));
        Assert.Equal(mode, File.GetUnixFileMode(path));
    }

    [Fact]
    public void Listing_is_nonrecursive_sorted_and_marks_links_without_following_them()
    {
        using var tree = new TemporaryTree();
        tree.Write("z", "");
        tree.Write("a/child", "");
        Directory.CreateSymbolicLink(Path.Combine(tree.Root, "cycle"), tree.Root);
        using var result = Run("ListJson", tree.Root, new { });
        var entries = result.RootElement.GetProperty("entries");
        Assert.Equal(new[] { "a", "cycle", "z" }, entries.EnumerateArray().Select(entry => entry.GetProperty("name").GetString()));
        Assert.True(entries[0].GetProperty("isDirectory").GetBoolean());
        Assert.True(entries[1].GetProperty("isSymbolicLink").GetBoolean());
        Assert.False(entries[2].GetProperty("isDirectory").GetBoolean());
        Assert.False(entries[2].TryGetProperty("isSymbolicLink", out _));
        using var file = Run("ListJson", Path.Combine(tree.Root, "z"), new { });
        Error(file, "NotADirectory");
    }

    [Theory]
    [InlineData("ReadJson")]
    [InlineData("WriteJson")]
    [InlineData("ListJson")]
    [InlineData("DeleteJson")]
    [InlineData("EditJson")]
    public void Links_and_link_ancestors_cannot_be_used_for_file_operations(string method)
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("dir/data", "a");
        Directory.CreateSymbolicLink(Path.Combine(tree.Root, "alias"), Path.Combine(tree.Root, "dir"));
        File.CreateSymbolicLink(Path.Combine(tree.Root, "file-alias"), path);
        string linkedPath = method == "ListJson" ? Path.Combine(tree.Root, "alias") : Path.Combine(tree.Root, "alias", "data");
        using var ancestor = Run(method, linkedPath, Options(method));
        Error(ancestor, "LinkNotAllowed");
        using var leaf = Run(method, Path.Combine(tree.Root, "file-alias"), Options(method));
        Error(leaf, "LinkNotAllowed");
        Assert.Equal("a", File.ReadAllText(path));
    }

    [Fact]
    public void Delete_removes_only_an_existing_file_and_missing_file_is_an_error()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("file", "data");
        using var deleted = Run("DeleteJson", path, new { });
        Assert.True(deleted.RootElement.GetProperty("deleted").GetBoolean());
        Assert.False(File.Exists(path));
        using var missing = Run("DeleteJson", path, new { });
        Error(missing, "FileNotFound");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Sequential_edits_preserve_BOM_newlines_and_exact_other_bytes(bool bom)
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", (bom ? "\uFEFF" : "") + "Привет\r\nalpha\rtail\n");
        using var result = Run("EditJson", path, new { edits = new[] { new { oldText = "alpha", newText = "beta" }, new { oldText = "beta\rtail", newText = "gamma\rtail" } } });
        Assert.Equal("applied", result.RootElement.GetProperty("status").GetString());
        Assert.Equal(2, result.RootElement.GetProperty("editsCount").GetInt32());
        Assert.Equal(Encoding.UTF8.GetBytes((bom ? "\uFEFF" : "") + "Привет\r\ngamma\rtail\n"), File.ReadAllBytes(path));
        Assert.Single(Directory.GetFileSystemEntries(tree.Root));
    }

    [Theory]
    [InlineData("missing", "EditNotFound")]
    [InlineData("aa", "EditAmbiguous")]
    public void A_failed_later_edit_never_persists_earlier_edits_including_overlapping_matches(string oldText, string code)
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "start aaa end");
        using var result = Run("EditJson", path, new { edits = new[] { new { oldText = "start", newText = "changed" }, new { oldText, newText = "x" } } });
        Error(result, code);
        Assert.Equal(2, result.RootElement.GetProperty("error").GetProperty("editIndex").GetInt32());
        Assert.Equal("start aaa end", File.ReadAllText(path));
        Assert.Single(Directory.GetFileSystemEntries(tree.Root));
    }

    [Fact]
    public void Dry_run_returns_exact_preview_without_touching_bytes_or_creating_temp_files()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "a\r\nb");
        using var result = Run("EditJson", path, new { dryRun = true, edits = new[] { new { oldText = "a", newText = "c" } } });
        Assert.Equal("dry_run", result.RootElement.GetProperty("status").GetString());
        Assert.Equal("c\r\nb", result.RootElement.GetProperty("content").GetString());
        Assert.Equal("a\r\nb", File.ReadAllText(path));
        Assert.Single(Directory.GetFileSystemEntries(tree.Root));
    }

    [Fact]
    public void Expected_hash_rejects_stale_edits_and_accepts_the_current_original_byte_hash()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "abc");
        using var stale = Run("EditJson", path, new { expectedSha256 = new string('0', 64), edits = new[] { new { oldText = "a", newText = "A" } } });
        Error(stale, "Conflict");
        Assert.Equal("abc", File.ReadAllText(path));
        using var valid = Run("EditJson", path, new { expectedSha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", edits = new[] { new { oldText = "a", newText = "A" } } });
        Assert.Equal("applied", valid.RootElement.GetProperty("status").GetString());
        Assert.Equal("Abc", File.ReadAllText(path));
    }

    [Fact]
    public void Explicit_null_expected_hash_is_invalid_instead_of_disabling_the_precondition()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "abc");
        using var result = Run("EditJson", path, new { expectedSha256 = (string?)null, edits = new[] { new { oldText = "a", newText = "A" } } });
        Error(result, "InvalidRequest");
        Assert.Equal("abc", File.ReadAllText(path));
    }

    [Fact]
    public void Empty_edits_are_a_noop_and_do_not_change_the_last_write_time()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "abc");
        var time = new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(path, time);
        using var result = Run("EditJson", path, new { edits = Array.Empty<object>() });
        Assert.Equal("unchanged", result.RootElement.GetProperty("status").GetString());
        Assert.Equal(time, File.GetLastWriteTimeUtc(path));
    }

    [Fact]
    public void Invalid_edits_and_oversized_results_fail_without_modifying_the_file()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "a");
        foreach (object options in new object[] {
            new { edits = new[] { new { oldText = "", newText = "x" } } },
            new { edits = (object?)null },
            new { edits = new[] { new { oldText = "a", newText = "x" } }, expectedSha256 = "invalid" },
            new { edits = new[] { new { oldText = "a", newText = "x\0" } } },
        })
        {
            using var invalid = Run("EditJson", path, options);
            Error(invalid, "InvalidRequest");
        }
        using var oversized = Run("EditJson", path, new { edits = new[] { new { oldText = "a", newText = new string('中', 400000) } } });
        Error(oversized, "LimitExceeded");
        Assert.Equal("a", File.ReadAllText(path));
        Assert.Single(Directory.GetFileSystemEntries(tree.Root));
    }

    [Fact]
    public void Write_budget_includes_the_BOM_and_refuses_overflow_without_truncating_existing_bytes()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("bounded", "original");
        using var limit = Run("WriteJson", path, new { content = new string('x', 1048574) });
        Error(limit, "LimitExceeded");
        Assert.Equal("original", File.ReadAllText(path));
        using var fits = Run("WriteJson", path, new { content = new string('x', 1048573) });
        Assert.Equal(1048576, fits.RootElement.GetProperty("bytesWritten").GetInt32());
        Assert.Equal(1048576, new FileInfo(path).Length);
        Assert.Single(Directory.GetFileSystemEntries(tree.Root));
    }

    [Fact]
    public void JSON_request_budget_is_checked_before_missing_path_or_filesystem_access()
    {
        var edits = Enumerable.Range(0, 100).Select(_ => new { oldText = new string('a', 90000), newText = "b" }).ToArray();
        using var result = Run("EditJson", Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()), new { edits });
        Error(result, "LimitExceeded");
    }

    [Fact]
    public void Listing_overflow_is_an_error_instead_of_a_successful_incomplete_array()
    {
        using var tree = new TemporaryTree();
        for (int index = 0; index < 10001; index++) File.WriteAllBytes(Path.Combine(tree.Root, index.ToString()), []);
        using var result = Run("ListJson", tree.Root, new { });
        Error(result, "LimitExceeded");
        Assert.False(result.RootElement.TryGetProperty("entries", out _));
    }
}
