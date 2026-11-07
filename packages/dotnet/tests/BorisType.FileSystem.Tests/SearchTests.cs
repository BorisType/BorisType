using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Text.Json;
using Xunit;

namespace BorisType.FileSystem.Tests;

public class SearchTests
{
    public static IEnumerable<object[]> FileNames()
    {
        yield return ["plain.bs"];
        if (!OperatingSystem.IsWindows())
        {
            yield return ["a\nb.bs"];
            yield return ["a\\b.bs"];
            yield return ["C:foo.bs"];
        }
    }

    [Theory]
    [MemberData(nameof(FileNames))]
    public void Terminal_double_star_preserves_legal_platform_filenames(string name)
    {
        using var tree = new TemporaryTree();
        // WriteBytes would intentionally treat / as a relative directory separator.
        File.WriteAllText(Path.Combine(tree.Root, name), "needle");
        using var result = Run(tree.Root, new { pattern = "**" });
        Assert.Equal([name], Paths(result));
    }

    // Exercise the same string ABI as the platform, without a compile-time type dependency.
    private static JsonDocument Run(string root, object options, CancellationToken? cancellation = null)
    {
        Type? type = Assembly.Load("BorisType.FileSystem").GetType("BorisType.FileSystem.Search");
        Assert.NotNull(type);
        Type[] parameters = cancellation.HasValue ? [typeof(string), typeof(string), typeof(CancellationToken)] : [typeof(string), typeof(string)];
        MethodInfo? method = cancellation.HasValue ? type.GetMethod("FindJsonWithCancellation", parameters)
            : type.GetMethod("FindJson", BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(method);
        object[] args = cancellation.HasValue ? [root, JsonSerializer.Serialize(options), cancellation.Value] : [root, JsonSerializer.Serialize(options)];
        try
        {
            return JsonDocument.Parse(Assert.IsType<string>(method.Invoke(null, args)));
        }
        catch (TargetInvocationException error) when (error.InnerException is not null)
        {
            ExceptionDispatchInfo.Capture(error.InnerException).Throw();
            throw;
        }
    }

    private static string[] Paths(JsonDocument result) => result.RootElement.GetProperty("matches").EnumerateArray()
        .Select(hit => hit.GetProperty("path").GetString()!).ToArray();

    [Theory]
    [InlineData("*.bs", "a.bs,lib/b.bs")]
    [InlineData("**/*.bs", "a.bs,lib/b.bs")]
    [InlineData("lib/*.bs", "lib/b.bs")]
    [InlineData("lib/?.bs", "lib/b.bs")]
    [InlineData("*.BS", "UPPER.BS")]
    public void Glob_searches_real_files_without_reading_contents(string pattern, string expected)
    {
        using var tree = new TemporaryTree();
        tree.Write("a.bs", "root");
        tree.Write("lib/b.bs", "nested");
        tree.Write("lib/c.xml", "xml");
        tree.Write("UPPER.BS", "case");
        using var result = Run(tree.Root, new { pattern });
        Assert.Equal(expected.Split(','), Paths(result));
        Assert.Equal(0, result.RootElement.GetProperty("stats").GetProperty("readBytes").GetInt64());
        Assert.Equal(JsonValueKind.Null, result.RootElement.GetProperty("limitReason").ValueKind);
        Assert.False(result.RootElement.GetProperty("matches")[0].TryGetProperty("text", out _));
    }

    [Fact]
    public void Excluded_directory_is_pruned_before_visiting_its_children()
    {
        using var tree = new TemporaryTree();
        tree.Write("vendor/a.bs", "needle");
        tree.Write("a.bs", "needle");
        using var result = Run(tree.Root, new { excludePatterns = new[] { "vendor/**" } });
        Assert.Equal(["a.bs"], Paths(result));
        Assert.Equal(2, result.RootElement.GetProperty("stats").GetProperty("visitedEntries").GetInt32());
    }

    [Fact]
    public void Content_search_preserves_unicode_and_counts_CR_LF_CRLF_lines()
    {
        using var tree = new TemporaryTree();
        tree.Write("код.bs", "\uFEFFПривет\r\nabc needle needle\rNEEDLE\n😀 needle");
        using var result = Run(tree.Root, new { query = "needle", ignoreCase = true });
        var hits = result.RootElement.GetProperty("matches");
        Assert.Equal(3, hits.GetArrayLength());
        Assert.Equal(new[] { 2, 3, 4 }, hits.EnumerateArray().Select(hit => hit.GetProperty("line").GetInt32()));
        Assert.Equal(new[] { 5, 1, 4 }, hits.EnumerateArray().Select(hit => hit.GetProperty("column").GetInt32()));
        Assert.Equal("abc needle needle", hits[0].GetProperty("text").GetString());
        Assert.Equal("😀 needle", hits[2].GetProperty("text").GetString());
        Assert.All(hits.EnumerateArray(), hit => Assert.Equal("код.bs", hit.GetProperty("path").GetString()));
    }

    [Theory]
    [InlineData(false, ".*", "literal .*", 9)]
    [InlineData(true, "n[e]+dle", "a needle", 3)]
    public void Literal_and_regex_have_distinct_semantics(bool regex, string query, string text, int column)
    {
        using var tree = new TemporaryTree();
        tree.Write("a.txt", text);
        using var result = Run(tree.Root, new { regex, query });
        Assert.Single(Paths(result));
        Assert.Equal(column, result.RootElement.GetProperty("matches")[0].GetProperty("column").GetInt32());
    }

    [Theory]
    [InlineData("{\"pattern\":null}")]
    [InlineData("{\"excludePatterns\":null}")]
    [InlineData("{\"excludePatterns\":[null]}")]
    [InlineData("{\"pattern\":\"../*\"}")]
    [InlineData("{\"pattern\":\"a**\"}")]
    [InlineData("{\"pattern\":\"C:/*.bs\"}")]
    [InlineData("{\"pattern\":\"[ab]\"}")]
    [InlineData("{\"query\":\"\"}")]
    [InlineData("{\"regex\":true}")]
    [InlineData("{\"regex\":true,\"query\":\"[\"}")]
    [InlineData("{\"unknown\":1}")]
    [InlineData("{\"maxResults\":0}")]
    [InlineData("{\"maxResults\":1001}")]
    [InlineData("{\"maxEntries\":100001}")]
    [InlineData("{\"maxDepth\":-1}")]
    [InlineData("{\"maxFileBytes\":8388609}")]
    [InlineData("{\"maxTotalBytes\":0}")]
    [InlineData("{\"timeoutMs\":10001}")]
    [InlineData("{\"maxLineLength\":8193}")]
    public void Invalid_requests_fail_before_any_traversal(string json)
    {
        using var options = JsonDocument.Parse(json);
        // Missing root would give DirectoryNotFoundException if validation ran too late.
        Assert.ThrowsAny<ArgumentException>(() => Run(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()), options.RootElement));
    }

    [Fact]
    public void Relative_root_is_rejected_without_guessing_the_host_working_directory()
        => Assert.ThrowsAny<ArgumentException>(() => Run("relative/path", new { }));

    [Fact]
    public void Missing_root_is_not_a_successful_empty_search()
        => Assert.Throws<DirectoryNotFoundException>(() => Run(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()), new { }));

    [Fact]
    public void Binary_invalid_UTF8_large_files_and_long_lines_have_explicit_counters()
    {
        using var tree = new TemporaryTree();
        tree.WriteBytes("binary", [110, 0, 101]);
        tree.WriteBytes("invalid", [0xff, 0xfe, 0x41]);
        tree.Write("large", new string('x', 101));
        tree.Write("long", new string('n', 21) + "\nneedle");
        tree.Write("good", "needle");
        using var result = Run(tree.Root, new { query = "needle", maxFileBytes = 100, maxLineLength = 20 });
        Assert.Equal(new[] { "good", "long" }, Paths(result));
        var skipped = result.RootElement.GetProperty("skipped");
        Assert.Equal(1, skipped.GetProperty("binary").GetInt32());
        Assert.Equal(1, skipped.GetProperty("invalidEncoding").GetInt32());
        Assert.Equal(1, skipped.GetProperty("tooLarge").GetInt32());
        Assert.Equal(1, skipped.GetProperty("longLines").GetInt32());
    }

    [Theory]
    [InlineData("results")]
    [InlineData("entries")]
    [InlineData("bytes")]
    public void Work_budgets_stop_early_and_report_partial_results(string budget)
    {
        using var tree = new TemporaryTree();
        for (int i = 0; i < 4; i++) tree.Write(i + ".txt", "xx");
        object options = budget switch
        {
            "results" => new { maxResults = 1 },
            "entries" => new { maxEntries = 2 },
            _ => new { query = "x", maxTotalBytes = 3 },
        };
        using var result = Run(tree.Root, options);
        Assert.Equal(budget, result.RootElement.GetProperty("limitReason").GetString());
        Assert.InRange(Paths(result).Length, 0, budget == "entries" ? 2 : 1);
        Assert.InRange(result.RootElement.GetProperty("stats").GetProperty("readBytes").GetInt64(), 0, 3);
    }

    [Fact]
    public void Depth_zero_searches_root_files_and_reports_unvisited_directories()
    {
        using var tree = new TemporaryTree();
        tree.Write("root", "");
        tree.Write("child/nested", "");
        using var result = Run(tree.Root, new { maxDepth = 0 });
        Assert.Equal(["root"], Paths(result));
        Assert.Equal(1, result.RootElement.GetProperty("skipped").GetProperty("depth").GetInt32());
    }

    [Fact]
    public void Links_are_not_followed_even_when_the_target_is_inside_the_root()
    {
        using var tree = new TemporaryTree();
        string target = tree.Write("data/hit", "needle");
        Directory.CreateSymbolicLink(Path.Combine(tree.Root, "cycle"), tree.Root);
        File.CreateSymbolicLink(Path.Combine(tree.Root, "alias"), target);
        using var result = Run(tree.Root, new { query = "needle" });
        Assert.Equal(["data/hit"], Paths(result));
        Assert.Equal(2, result.RootElement.GetProperty("skipped").GetProperty("links").GetInt32());
        Assert.ThrowsAny<ArgumentException>(() => Run(Path.Combine(tree.Root, "cycle", "data"), new { }));
    }

    [Fact]
    public void Already_cancelled_token_stops_before_filesystem_work()
    {
        using var tree = new TemporaryTree();
        Assert.ThrowsAny<OperationCanceledException>(() => Run(tree.Root, new { }, new CancellationToken(canceled: true)));
    }

    [Fact]
    public void Pathological_regex_is_bounded_and_reports_timeout()
    {
        using var tree = new TemporaryTree();
        tree.Write("a", new string('a', 5000) + "!");
        using var result = Run(tree.Root, new { query = "^(a+)+$", regex = true, maxLineLength = 8192 });
        Assert.Equal("regex", result.RootElement.GetProperty("limitReason").GetString());
    }

    [Fact]
    public void Response_budget_accounts_for_actual_JSON_escaping()
    {
        using var tree = new TemporaryTree();
        tree.Write("unicode", string.Join('\n', Enumerable.Repeat("needle" + new string('中', 1000), 200)));
        using var result = Run(tree.Root, new { query = "needle" });
        Assert.Equal("output", result.RootElement.GetProperty("limitReason").GetString());
        Assert.NotEmpty(Paths(result));
        Assert.InRange(Encoding.UTF8.GetByteCount(result.RootElement.GetRawText()), 1, 262144);
    }
}
