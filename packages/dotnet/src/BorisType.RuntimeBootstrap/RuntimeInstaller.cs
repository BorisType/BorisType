using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Loader;
using System.Text.Json;

namespace BorisType.RuntimeBootstrap;

/// <summary>Installs immutable component artifacts and identifies code loaded by a specific managed host context.</summary>
public sealed class RuntimeInstaller(string root, AssemblyLoadContext context)
{
    /// <summary>Installs verified payloads and activates code when the managed host has no conflicting module.</summary>
    public string EnsureJson(string descriptorJson, string payloadJson) => Run(descriptorJson, payloadJson);

    /// <summary>Publishes the selection for a startup handler without loading its assembly.</summary>
    public string StageJson(string descriptorJson, string payloadJson) => Run(descriptorJson, payloadJson, stageOnly: true);

    /// <summary>Reads installed and loaded identities without loading the requested component.</summary>
    public string InspectJson(string descriptorJson) => Run(descriptorJson, null);

    private string Run(string descriptorJson, string? payloadJson, bool stageOnly = false)
    {
        Component? expected = null, installed = null;
        BuildIdentity? loaded = null;
        bool changed = false;
        object Result(string status, string reason) => new
        {
            schemaVersion = 1, status, reason, expected = expected?.Identity, installed = installed?.Identity, loaded, changed,
            process = new
            {
                pid = Environment.ProcessId,
                startedAt = Process.GetCurrentProcess().StartTime.ToUniversalTime().ToString("O"),
                framework = RuntimeInformation.FrameworkDescription,
                architecture = RuntimeInformation.ProcessArchitecture.ToString(),
            },
        };
        try
        {
            expected = Component.Parse(descriptorJson);
            var store = new ArtifactStore(root);
            using var guard = store.Lock();
            BuildIdentity? ReadLoaded()
            {
                var matches = context.Assemblies.Select(expected.MatchLoaded).OfType<BuildIdentity>().ToArray();
                if (matches.Length > 1) throw new InstallFailure("AmbiguousLoadedAssembly");
                return matches.SingleOrDefault();
            }
            object? LoadedResult(Component candidate)
            {
                if (loaded is null) return null;
                if (loaded.ApiVersion != expected.ApiVersion) return Result("blocked", "IncompatibleApi");
                int version = Wire.CompareVersions(loaded.Version, expected.Version);
                if (version > 0) return Result("ready", "NewerCompatible");
                if (loaded.BuildId != candidate.BuildId) return Result("restart_required", "LoadedBuildMismatch");
                if (loaded.Version != candidate.Version || loaded.ApiVersion != candidate.ApiVersion) throw new InstallFailure("ArtifactMismatch");
                return Result("ready", "Current");
            }
            loaded = ReadLoaded();
            Component selected = store.Select(expected, out bool alreadySelected);
            if (!stageOnly && (expected.HasVersionedEntry() || selected.HasVersionedEntry()))
                return Serialize(Result("blocked", "StartupOwnedComponent"));
            if (loaded is not null && Wire.CompareVersions(loaded.Version, expected.Version) > 0 && selected.Version == expected.Version)
            {
                if (stageOnly) return Serialize(Result("blocked", "NewerLoadedWithoutSelection"));
                if (loaded.ApiVersion != expected.ApiVersion) return Serialize(Result("blocked", "IncompatibleApi"));
                if (store.Verify(selected)) installed = selected;
                return Serialize(Result("ready", "NewerCompatible"));
            }
            if (payloadJson is not null)
            {
                changed = store.Install(selected, selected.BuildId == expected.BuildId ? payloadJson : "{}");
                if (!alreadySelected)
                {
                    store.Activate(selected);
                    changed = true;
                }
            }
            if (store.Verify(selected)) installed = selected;
            // Other platform code does not participate in our installation lock.
            // Reconcile its loads after staging, then also handle the final race
            // between this enumeration and LoadFromAssemblyPath itself.
            loaded = ReadLoaded();
            if (stageOnly)
            {
                if (installed is null) throw new InstallFailure("CorruptInstallation");
                return Serialize(Result("installed", "PreparedForStartup"));
            }
            if (LoadedResult(selected) is object result) return Serialize(result);
            if (installed is null) return Serialize(Result("missing", "NotInstalled"));
            if (payloadJson is null) return Serialize(Result("installed", "NotLoaded"));
            Assembly active;
            try { active = context.LoadFromAssemblyPath(Path.Combine(store.DirectoryFor(selected), selected.EntryAssembly)); }
            catch (FileLoadException)
            {
                loaded = ReadLoaded();
                if (LoadedResult(selected) is object concurrent) return Serialize(concurrent);
                throw;
            }
            loaded = BuildIdentity.FromAssembly(active);
            if (loaded != selected.Identity) return Serialize(LoadedResult(selected)!);
            return Serialize(Result("ready", changed ? "Installed" : "Loaded"));
        }
        catch (Exception error)
        {
            string reason = error switch
            {
                InstallFailure => error.Message,
                UnauthorizedAccessException => "PermissionDenied",
                JsonException or FormatException or ArgumentException => "InvalidInput",
                IOException => "InstallationIoError",
                BadImageFormatException => "ArtifactMismatch",
                _ => "RuntimeError",
            };
            return Serialize(Result("blocked", reason));
        }
    }

    private static string Serialize(object value) => JsonSerializer.Serialize(value, Wire.Options);
}

/// <summary>Fixed string ABI used by BorisScript without Datex dependencies or callbacks.</summary>
public static class EntryPoint
{
    /// <summary>Prepares a component using its manifest and base64 payload dictionary.</summary>
    public static string EnsureJson(string root, string descriptorJson, string payloadJson) =>
        new RuntimeInstaller(root, AssemblyLoadContext.GetLoadContext(typeof(EntryPoint).Assembly)!).EnsureJson(descriptorJson, payloadJson);

    /// <summary>Stages a verified selection for the next startup without executing component code.</summary>
    public static string StageJson(string root, string descriptorJson, string payloadJson) =>
        new RuntimeInstaller(root, AssemblyLoadContext.GetLoadContext(typeof(EntryPoint).Assembly)!).StageJson(descriptorJson, payloadJson);

    /// <summary>Inspects component status without loading that component.</summary>
    public static string InspectJson(string root, string descriptorJson) =>
        new RuntimeInstaller(root, AssemblyLoadContext.GetLoadContext(typeof(EntryPoint).Assembly)!).InspectJson(descriptorJson);
}
