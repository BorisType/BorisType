using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace BorisType.RuntimeBootstrap;

internal sealed record ArtifactFile(string Path, int Bytes, string Sha256);
internal sealed record Component(string Id, string Version, int ApiVersion, string TargetFramework, string BuildId,
    string EntryAssembly, ArtifactFile[] Files)
{
    public BuildIdentity Identity => new(Id, Version, ApiVersion, BuildId);

    public static Component Parse(string json)
    {
        if (json.Length > 65536) throw new InstallFailure("InvalidManifest");
        Component value = JsonSerializer.Deserialize<Component>(json, Wire.Options) ?? throw new InstallFailure("InvalidManifest");
        if (value.Id is null || !Regex.IsMatch(value.Id, @"^BorisType\.[A-Za-z0-9.]{1,120}$") ||
            value.Version is null || !Regex.IsMatch(value.Version, @"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$") ||
            value.ApiVersion is < 1 or > 64 || value.TargetFramework != "net9.0" ||
            !Guid.TryParseExact(value.BuildId, "D", out Guid buildId) || buildId == Guid.Empty ||
            value.EntryAssembly != value.Id + ".dll" || value.Files is null || value.Files.Length is < 1 or > 16)
            throw new InstallFailure("InvalidManifest");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        foreach (ArtifactFile? file in value.Files)
        {
            if (file is null || file.Path is null || !Regex.IsMatch(file.Path, @"^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}$") ||
                file.Bytes is < 1 or > 4194304 || file.Sha256 is null || !Regex.IsMatch(file.Sha256, "^[a-f0-9]{64}$") || !names.Add(file.Path))
                throw new InstallFailure("InvalidManifest");
            total += file.Bytes;
        }
        if (total > 8388608 || !names.Contains(value.EntryAssembly)) throw new InstallFailure("InvalidManifest");
        return value;
    }

    public void CheckModule(string path)
    {
        ModuleIdentity metadata = ModuleIdentity.Read(path);
        if (metadata.Id != Id || metadata.BuildId != BuildId || metadata.Version != Version ||
            metadata.ApiVersion != ApiVersion || metadata.TargetFramework != ".NETCoreApp,Version=v9.0")
            throw new InstallFailure("ArtifactMismatch");
    }
}

internal sealed record BuildIdentity(string Id, string Version, int ApiVersion, string BuildId)
{
    public static BuildIdentity FromAssembly(Assembly assembly)
    {
        string? api = assembly.GetCustomAttributes<AssemblyMetadataAttribute>().SingleOrDefault(a => a.Key == "BorisType.ApiVersion")?.Value;
        return new(assembly.GetName().Name!,
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? assembly.GetName().Version!.ToString(),
            int.TryParse(api, out int version) && version > 0 ? version : 0, assembly.ManifestModule.ModuleVersionId.ToString("D"));
    }
}

internal sealed class InstallFailure(string reason) : Exception(reason);

internal static class Wire
{
    internal static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        MaxDepth = 16,
    };

    internal static int CompareVersions(string left, string right)
    {
        string[] a = left.Split('+')[0].Split('-', 2), b = right.Split('+')[0].Split('-', 2);
        int core = System.Version.Parse(a[0]).CompareTo(System.Version.Parse(b[0]));
        if (core != 0) return core;
        if (a.Length != b.Length) return a.Length == 1 ? 1 : -1;
        if (a.Length == 1) return 0;
        string[] ap = a[1].Split('.'), bp = b[1].Split('.');
        for (int i = 0; i < Math.Min(ap.Length, bp.Length); i++)
        {
            bool an = ulong.TryParse(ap[i], out ulong av), bn = ulong.TryParse(bp[i], out ulong bv);
            int comparison = an && bn ? av.CompareTo(bv) : an != bn ? (an ? -1 : 1) : string.CompareOrdinal(ap[i], bp[i]);
            if (comparison != 0) return comparison;
        }
        return ap.Length.CompareTo(bp.Length);
    }
}
