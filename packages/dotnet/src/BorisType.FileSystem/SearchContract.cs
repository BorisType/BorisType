using System.Text.Json;
using System.Text.Json.Serialization;

namespace BorisType.FileSystem;

internal sealed record SearchRequest
{
    internal static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public string Pattern { get; init; } = "**/*";
    public string[] ExcludePatterns { get; init; } = [];
    public string? Query { get; init; }
    public bool Regex { get; init; }
    public bool IgnoreCase { get; init; }
    public int MaxResults { get; init; } = 200;
    public int MaxEntries { get; init; } = 10000;
    public int MaxDepth { get; init; } = 10;
    public int MaxFileBytes { get; init; } = 1048576;
    public int MaxTotalBytes { get; init; } = 16777216;
    public int TimeoutMs { get; init; } = 2000;
    public int MaxLineLength { get; init; } = 2000;

    internal static SearchRequest Parse(string json)
    {
        SearchRequest request;
        try
        {
            request = JsonSerializer.Deserialize<SearchRequest>(json, Json)
                ?? throw new ArgumentException("Search request must be an object.");
        }
        catch (JsonException error)
        {
            throw new ArgumentException("Invalid search request JSON.", nameof(json), error);
        }
        if (request.ExcludePatterns is null || request.ExcludePatterns.Length > 32)
            throw new ArgumentException("excludePatterns must be an array of at most 32 globs.");
        if (request.Query is { Length: 0 or > 1024 } || (request.Regex && request.Query is null))
            throw new ArgumentException("query must contain 1–1024 characters; regex requires query.");
        Range(request.MaxResults, 1, 1000, "maxResults");
        Range(request.MaxEntries, 1, 100000, "maxEntries");
        Range(request.MaxDepth, 0, 32, "maxDepth");
        Range(request.MaxFileBytes, 1, 8388608, "maxFileBytes");
        Range(request.MaxTotalBytes, 1, 67108864, "maxTotalBytes");
        Range(request.TimeoutMs, 1, 10000, "timeoutMs");
        Range(request.MaxLineLength, 1, 8192, "maxLineLength");
        return request;
    }

    private static void Range(int value, int minimum, int maximum, string name)
    {
        if (value < minimum || value > maximum)
            throw new ArgumentOutOfRangeException(name, $"Expected {minimum}–{maximum}.");
    }
}

internal sealed record SearchMatch(
    string Path,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Line = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Column = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Text = null);

internal sealed class SearchResponse
{
    public int ApiVersion => 1;
    public List<SearchMatch> Matches { get; } = [];
    public string? LimitReason { get; set; }
    public SearchStats Stats { get; } = new();
    public SearchSkipped Skipped { get; } = new();
}

internal sealed class SearchStats
{
    public int VisitedEntries { get; set; }
    public int FilesRead { get; set; }
    public long ReadBytes { get; set; }
}

internal sealed class SearchSkipped
{
    public int Links { get; set; }
    public int Depth { get; set; }
    public int TooLarge { get; set; }
    public int Binary { get; set; }
    public int InvalidEncoding { get; set; }
    public int LongLines { get; set; }
    public int IoErrors { get; set; }
}
