using System.Text.Json.Serialization;

namespace BorisType.FileSystem;

internal sealed record TextRange([property: JsonRequired] int Start, [property: JsonRequired] int End);

internal static class TextCoverage
{
    internal static void ValidateHash(string? hash)
    {
        if (hash is null || hash.Length != 64 || !hash.All(char.IsAsciiHexDigit))
            throw new FileProblem("InvalidRequest", "expectedSha256 must contain 64 hexadecimal characters.");
    }

    internal static object Slice(TextSnapshot data, ReadFileRequest request)
    {
        var starts = new List<int> { 0 };
        for (int index = 0; index < data.Content.Length; index++)
        {
            char current = data.Content[index];
            if (current == '\r' && index + 1 < data.Content.Length && data.Content[index + 1] == '\n') index++;
            if (current is '\r' or '\n') starts.Add(index + 1);
        }
        if (request.StartLine < 1 || request.StartLine > starts.Count || request.EndLine < request.StartLine)
            throw new FileProblem("InvalidRange", "Expected an existing startLine and endLine >= startLine.");
        int endLine = Math.Min(request.EndLine ?? starts.Count, starts.Count);
        int startOffset = starts[request.StartLine - 1];
        int endOffset = endLine < starts.Count ? starts[endLine] : data.Content.Length;
        return new { apiVersion = 2, content = data.Content[startOffset..endOffset], data.Sha256, data.Bom,
            startLine = request.StartLine, endLine, totalLines = starts.Count, startOffset, endOffset, totalLength = data.Content.Length };
    }

    internal static List<TextRange> Validate(TextRange[] ranges, int length)
    {
        int previousEnd = -1;
        foreach (var range in ranges)
        {
            if (range.Start < 0 || range.End < range.Start || range.End > length || range.Start <= previousEnd)
                throw new FileProblem("InvalidRequest", "allowedRanges must be sorted, nonoverlapping, merged and within the original text.");
            previousEnd = range.End;
        }
        return [.. ranges];
    }

    internal static void Apply(List<TextRange> ranges, int start, int end, int newLength, int editIndex)
    {
        int owner = ranges.FindIndex(range => range.Start <= start && range.End >= end);
        if (owner < 0) throw new FileProblem("ReadRequired", "Read the entire oldText range in the current version before editing.", editIndex);
        int delta = newLength - (end - start);
        ranges[owner] = ranges[owner] with { End = ranges[owner].End + delta };
        for (int index = owner + 1; index < ranges.Count; index++)
            ranges[index] = new TextRange(ranges[index].Start + delta, ranges[index].End + delta);
    }
}
