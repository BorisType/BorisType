using System.Globalization;
using System.Reflection;
using System.Text.Json;

namespace BorisType.FileSystem;

/// <summary>Identifies the installed library and the operations it exposes.</summary>
public static class LibraryInfo
{
    /// <summary>Returns metadata as JSON text without requiring a WebSoft context.</summary>
    public static string GetMetadataJson()
    {
        Assembly assembly = typeof(LibraryInfo).Assembly;
        string version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()!.InformationalVersion;
        string apiVersion = assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .Single(item => item.Key == "BorisType.ApiVersion").Value!;
        return JsonSerializer.Serialize(new
        {
            id = assembly.GetName().Name,
            version,
            apiVersion = int.Parse(apiVersion, CultureInfo.InvariantCulture),
            capabilities = Array.Empty<string>(),
        });
    }
}
