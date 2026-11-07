using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Xunit;

namespace BorisType.FileSystem.Tests;

public class ReadAwareTests
{
    private static JsonDocument Run(string method, string path, object request) => JsonDocument.Parse(
        (string)typeof(Files).GetMethod(method)!.Invoke(null, [path, JsonSerializer.Serialize(request)])!);
    private static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    private static void Error(JsonDocument result, string code) => Assert.Equal(code, result.RootElement.GetProperty("error").GetProperty("code").GetString());

    [Fact]
    public void Line_read_preserves_terminators_and_uses_UTF16_offsets_after_BOM()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("lines", "\uFEFFa\r\n👋\rb\n");
        using var result = Run("ReadJson", path, new { startLine = 2, endLine = 2 });
        var data = result.RootElement;
        Assert.Equal("👋\r", data.GetProperty("content").GetString());
        Assert.Equal(3, data.GetProperty("startOffset").GetInt32());
        Assert.Equal(6, data.GetProperty("endOffset").GetInt32());
        Assert.Equal(8, data.GetProperty("totalLength").GetInt32());
        Assert.Equal(4, data.GetProperty("totalLines").GetInt32());
        Assert.Equal(Hash("\uFEFFa\r\n👋\rb\n"), data.GetProperty("sha256").GetString());
    }

    [Theory]
    [InlineData("", 1, 99, "", 0, 0, 1)]
    [InlineData("a\nb\n", 2, 99, "b\n", 2, 4, 3)]
    [InlineData("a\nb\n", 3, 3, "", 4, 4, 3)]
    [InlineData("a\rb\r\nc", 2, 2, "b\r\n", 2, 5, 3)]
    public void Line_ranges_clamp_the_end_and_include_a_final_empty_line(string text, int startLine, int endLine, string expected, int start, int end, int lines)
    {
        using var tree = new TemporaryTree();
        using var result = Run("ReadJson", tree.Write("lines", text), new { startLine, endLine });
        Assert.Equal(expected, result.RootElement.GetProperty("content").GetString());
        Assert.Equal(start, result.RootElement.GetProperty("startOffset").GetInt32());
        Assert.Equal(end, result.RootElement.GetProperty("endOffset").GetInt32());
        Assert.Equal(lines, result.RootElement.GetProperty("totalLines").GetInt32());
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(2, 1)]
    [InlineData(5, 8)]
    public void Invalid_line_ranges_do_not_return_partial_success(int startLine, int endLine)
    {
        using var tree = new TemporaryTree();
        using var result = Run("ReadJson", tree.Write("lines", "a\nb"), new { startLine, endLine });
        Error(result, "InvalidRange");
    }

    [Fact]
    public void Missing_edit_preconditions_do_not_allow_a_guessed_patch()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "abc");
        using var result = Run("EditJson", path, new { edits = new[] { new { oldText = "a", newText = "A" } } });
        Error(result, "InvalidRequest");
        Assert.Equal("abc", File.ReadAllText(path));
    }

    [Fact]
    public void Correct_hash_does_not_allow_a_patch_outside_read_ranges()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "abc\ndef");
        using var result = Run("EditJson", path, new { expectedSha256 = Hash("abc\ndef"), allowedRanges = new[] { new { start = 0, end = 4 } },
            edits = new[] { new { oldText = "abc", newText = "ABC" }, new { oldText = "def", newText = "DEF" } } });
        Error(result, "ReadRequired");
        Assert.Equal(2, result.RootElement.GetProperty("error").GetProperty("editIndex").GetInt32());
        Assert.Equal("abc\ndef", File.ReadAllText(path));
        Assert.Single(Directory.GetFileSystemEntries(tree.Root));
    }

    [Fact]
    public void Sequential_patches_shift_later_ranges_and_allow_the_newly_supplied_text()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "a?xyz");
        using var result = Run("EditJson", path, new { expectedSha256 = Hash("a?xyz"),
            allowedRanges = new[] { new { start = 0, end = 1 }, new { start = 2, end = 5 } },
            edits = new[] { new { oldText = "a", newText = "long" }, new { oldText = "long", newText = "L" }, new { oldText = "xyz", newText = "Z" } } });
        Assert.Equal("applied", result.RootElement.GetProperty("status").GetString());
        Assert.Equal("L?Z", File.ReadAllText(path));
    }

    [Fact]
    public void A_patch_cannot_bridge_an_unread_gap_even_if_both_ends_were_read()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "a?z");
        using var result = Run("EditJson", path, new { expectedSha256 = Hash("a?z"),
            allowedRanges = new[] { new { start = 0, end = 1 }, new { start = 2, end = 3 } },
            edits = new[] { new { oldText = "a?z", newText = "x" } } });
        Error(result, "ReadRequired");
        Assert.Equal("a?z", File.ReadAllText(path));
    }

    [Fact]
    public void Create_only_never_overwrites_an_existing_file()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("file", "keep");
        using var result = Run("WriteJson", path, new { content = "lost", mode = "create" });
        Error(result, "AlreadyExists");
        Assert.Equal("keep", File.ReadAllText(path));
        Assert.Single(Directory.GetFileSystemEntries(tree.Root));
    }

    [Fact]
    public void Overwrite_requires_a_matching_original_byte_hash()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("file", "keep");
        using var missing = Run("WriteJson", path, new { content = "lost", mode = "overwrite" });
        Error(missing, "InvalidRequest");
        using var stale = Run("WriteJson", path, new { content = "lost", mode = "overwrite", expectedSha256 = Hash("stale") });
        Error(stale, "Conflict");
        Assert.Equal("keep", File.ReadAllText(path));
        using var valid = Run("WriteJson", path, new { content = "new", mode = "overwrite", expectedSha256 = Hash("keep") });
        Assert.Equal(Encoding.UTF8.GetBytes("\uFEFFnew"), File.ReadAllBytes(path));
        Assert.False(valid.RootElement.TryGetProperty("error", out _));
    }

    [Fact]
    public void Missing_range_coordinates_are_not_inferred_as_zero()
    {
        using var tree = new TemporaryTree();
        string path = tree.Write("edit", "abc");
        using var result = Run("EditJson", path, new { expectedSha256 = Hash("abc"), allowedRanges = new[] { new { end = 3 } },
            edits = new[] { new { oldText = "a", newText = "A" } } });
        Error(result, "InvalidRequest");
        Assert.Equal("abc", File.ReadAllText(path));
    }
}
