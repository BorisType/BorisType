using System.Text;
using System.Text.RegularExpressions;

namespace BorisType.FileSystem;

internal sealed class GlobPattern
{
    private readonly Regex matcher;
    private readonly bool basename;

    internal GlobPattern(string pattern)
    {
        if (string.IsNullOrEmpty(pattern) || pattern.Length > 256 || pattern.Any(char.IsControl)
            || pattern.IndexOfAny(['\\', '[', ']', '{', '}']) >= 0
            || (pattern.Length >= 2 && char.IsAsciiLetter(pattern[0]) && pattern[1] == ':'))
            throw new ArgumentException("Invalid glob: use relative slash paths and *, ? or whole-segment **.");
        string[] segments = pattern.Split('/');
        if (segments.Any(segment => segment is "" or "." or ".." || (segment.Contains("**") && segment != "**")))
            throw new ArgumentException("Invalid glob segment.");
        basename = !pattern.Contains('/');
        var expression = new StringBuilder("\\A");
        for (int i = 0; i < segments.Length; i++)
        {
            string segment = segments[i];
            if (segment == "**") expression.Append(i == segments.Length - 1 ? ".*" : "(?:[^/]+/)*");
            else
            {
                foreach (char character in segment)
                    expression.Append(character switch { '*' => "[^/]*", '?' => "[^/]", _ => Regex.Escape(character.ToString()) });
                if (i != segments.Length - 1) expression.Append('/');
            }
        }
        expression.Append("\\z");
        matcher = new Regex(expression.ToString(), RegexOptions.NonBacktracking | RegexOptions.CultureInvariant | RegexOptions.Singleline);
    }

    internal bool Matches(string path) => matcher.IsMatch(basename ? path[(path.LastIndexOf('/') + 1)..] : path);

    internal bool ExcludesDirectory(string path) => Matches(path) || (!basename && Matches(path + "/"));
}
