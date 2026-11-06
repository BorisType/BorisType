using System.Reflection;
using System.Text.Json;
using Xunit;

namespace BorisType.FileSystem.Tests;

public class LibraryInfoTests
{
    [Fact]
    public void Metadata_entry_point_is_callable_without_a_platform_context()
    {
        Assembly assembly = Assembly.Load("BorisType.FileSystem");
        Type? type = assembly.GetType("BorisType.FileSystem.LibraryInfo");
        Assert.NotNull(type);
        MethodInfo? method = type.GetMethod("GetMetadataJson", BindingFlags.Public | BindingFlags.Static,
            null, Type.EmptyTypes, null);
        Assert.NotNull(method);
        Assert.Equal(typeof(string), method.ReturnType);
        string json = Assert.IsType<string>(method.Invoke(null, null));
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;
        Assert.Equal("BorisType.FileSystem", root.GetProperty("id").GetString());
        Assert.Equal(1, root.GetProperty("apiVersion").GetInt32());
        Assert.Matches(@"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$", root.GetProperty("version").GetString()!);
        Assert.Empty(root.GetProperty("capabilities").EnumerateArray());
    }
}
