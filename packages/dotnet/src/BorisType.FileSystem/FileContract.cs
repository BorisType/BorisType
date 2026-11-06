using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BorisType.FileSystem;

internal sealed class FileProblem(string code, string message, int? editIndex = null) : Exception(message)
{
    internal string Code { get; } = code;
    internal int? EditIndex { get; } = editIndex;
}

internal static class FileJson
{
    internal const int MaxTextBytes = 1048576;
    internal const int MaxJsonBytes = 8388608;
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    internal static T Parse<T>(string json)
    {
        if (json is null || Encoding.UTF8.GetByteCount(json) > MaxJsonBytes)
            throw new FileProblem("LimitExceeded", "Request JSON exceeds 8 MiB.");
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind != JsonValueKind.Object || document.RootElement.EnumerateObject().Any(property => property.Value.ValueKind == JsonValueKind.Null))
            throw new FileProblem("InvalidRequest", "Expected an options object without null fields.");
        return JsonSerializer.Deserialize<T>(json, Options) ?? throw new FileProblem("InvalidRequest", "Expected an options object.");
    }

    internal static string Serialize(object value)
    {
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(value, Options);
        if (bytes.Length > MaxJsonBytes) throw new FileProblem("LimitExceeded", "Response JSON exceeds 8 MiB.");
        return Encoding.UTF8.GetString(bytes);
    }

    internal static string Execute(Func<string> operation)
    {
        try { return operation(); }
        catch (FileProblem error) { return Failure(error.Code, error.Message, error.EditIndex); }
        catch (DecoderFallbackException) { return Failure("InvalidEncoding", "File is not valid UTF-8."); }
        catch (Exception error) when (error is JsonException or ArgumentException)
        { return Failure("InvalidRequest", "Invalid file operation options."); }
        catch (FileNotFoundException) { return Failure("FileNotFound", "File does not exist."); }
        catch (DirectoryNotFoundException) { return Failure("DirectoryNotFound", "Parent or directory does not exist."); }
        catch (UnauthorizedAccessException) { return Failure("AccessDenied", "File operation is not permitted."); }
        catch (IOException) { return Failure("IoError", "Filesystem operation failed."); }
    }

    private static string Failure(string code, string message, int? editIndex = null)
        => Serialize(new { apiVersion = 2, error = new { code, message, editIndex } });
}

internal sealed record EmptyFileRequest;
internal sealed record ReadFileRequest
{
    public int StartLine { get; init; } = 1;
    public int? EndLine { get; init; }
}
internal sealed record WriteFileRequest
{
    public string? Content { get; init; }
    public string Mode { get; init; } = "create";
    public string? ExpectedSha256 { get; init; }

    internal void Validate()
    {
        if (Mode is not ("create" or "overwrite") || (Mode == "create" && ExpectedSha256 is not null))
            throw new FileProblem("InvalidRequest", "Expected mode create or overwrite; create does not accept a hash.");
        if (Mode == "overwrite") TextCoverage.ValidateHash(ExpectedSha256);
    }
}
internal sealed record EditItem
{
    public string? OldText { get; init; }
    public string? NewText { get; init; }
}
internal sealed record EditFileRequest
{
    public EditItem[]? Edits { get; init; }
    public bool DryRun { get; init; }
    public string? ExpectedSha256 { get; init; }
    public TextRange[]? AllowedRanges { get; init; }

    internal void Validate()
    {
        if (Edits is null || Edits.Length > 100 || Edits.Any(edit => edit is null || string.IsNullOrEmpty(edit.OldText) || edit.NewText is null
            || edit.OldText.Contains('\0') || edit.NewText.Contains('\0')))
            throw new FileProblem("InvalidRequest", "Expected at most 100 edits with nonempty oldText and string newText, without NUL.");
        TextCoverage.ValidateHash(ExpectedSha256);
        if (AllowedRanges is null || AllowedRanges.Length is < 1 or > 256 || AllowedRanges.Any(range => range is null))
            throw new FileProblem("InvalidRequest", "Expected 1 to 256 allowedRanges from a prior read.");
    }
}
