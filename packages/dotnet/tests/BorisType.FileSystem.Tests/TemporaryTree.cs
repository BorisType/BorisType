using System.Text;

namespace BorisType.FileSystem.Tests;

internal sealed class TemporaryTree : IDisposable
{
    internal string Root { get; } = Path.Combine(Path.GetTempPath(), "boristype-search-" + Guid.NewGuid().ToString("N"));

    internal TemporaryTree() => Directory.CreateDirectory(Root);

    internal string Write(string relative, string text) => WriteBytes(relative, Encoding.UTF8.GetBytes(text));

    internal string WriteBytes(string relative, byte[] bytes)
    {
        string path = Path.Combine(Root, relative.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, bytes);
        return path;
    }

    public void Dispose() => Directory.Delete(Root, recursive: true);
}
