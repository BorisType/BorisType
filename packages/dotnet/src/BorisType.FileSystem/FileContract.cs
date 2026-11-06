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
        => Serialize(new { apiVersion = 1, error = new { code, message, editIndex } });
}

internal sealed record EmptyFileRequest;
internal sealed record WriteFileRequest
{
    public string? Content { get; init; }
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

    internal void Validate()
    {
        if (Edits is null || Edits.Length > 100 || Edits.Any(edit => edit is null || string.IsNullOrEmpty(edit.OldText) || edit.NewText is null
            || edit.OldText.Contains('\0') || edit.NewText.Contains('\0')))
            throw new FileProblem("InvalidRequest", "Expected at most 100 edits with nonempty oldText and string newText, without NUL.");
        if (ExpectedSha256 is not null && (ExpectedSha256.Length != 64 || !ExpectedSha256.All(char.IsAsciiHexDigit)))
            throw new FileProblem("InvalidRequest", "expectedSha256 must contain 64 hexadecimal characters.");
    }
}
