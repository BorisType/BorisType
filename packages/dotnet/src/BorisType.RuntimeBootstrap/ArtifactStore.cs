using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;

namespace BorisType.RuntimeBootstrap;

internal sealed class ArtifactStore(string root)
{
    internal string Root { get; } = Path.IsPathFullyQualified(root) ? Path.GetFullPath(root) : throw new InstallFailure("InvalidRoot");

    internal FileStream Lock()
    {
        SafeDirectory(Root);
        string path = Path.Combine(Root, ".install.lock");
        RejectLink(path);
        var timer = Stopwatch.StartNew();
        while (true)
        {
            try { return new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) when (timer.ElapsedMilliseconds < 5000) { Thread.Sleep(25); }
        }
    }

    internal string DirectoryFor(Component component) => Path.Combine(Root, "components", component.Id, component.Version + "-" + component.BuildId);
    private string MarkerFor(Component component) => Path.Combine(Root, "components", component.Id, "active.json");

    internal Component Select(Component requested)
    {
        string marker = MarkerFor(requested);
        RejectAncestors(marker);
        if (!File.Exists(marker)) return requested;
        if (new FileInfo(marker).Length > 65536) throw new InstallFailure("CorruptInstallation");
        Component active = Component.Parse(File.ReadAllText(marker));
        if (active.Id != requested.Id) throw new InstallFailure("CorruptInstallation");
        int compared = Wire.CompareVersions(active.Version, requested.Version);
        if (compared > 0)
        {
            if (active.ApiVersion != requested.ApiVersion) throw new InstallFailure("IncompatibleApi");
            return active;
        }
        if (compared == 0 && active.BuildId != requested.BuildId) throw new InstallFailure("BuildConflict");
        return requested;
    }

    internal bool Verify(Component component)
    {
        string directory = DirectoryFor(component);
        RejectAncestors(directory);
        if (!Directory.Exists(directory)) return false;
        foreach (ArtifactFile file in component.Files)
        {
            string path = Path.Combine(directory, file.Path);
            RejectLink(path);
            if (!File.Exists(path) || new FileInfo(path).Length != file.Bytes) throw new InstallFailure("CorruptInstallation");
            using FileStream stream = File.OpenRead(path);
            if (Convert.ToHexStringLower(SHA256.HashData(stream)) != file.Sha256) throw new InstallFailure("CorruptInstallation");
        }
        component.CheckModule(Path.Combine(directory, component.EntryAssembly));
        return true;
    }

    internal bool Install(Component component, string payloadJson)
    {
        if (Verify(component)) return false;
        if (payloadJson.Length > 12582912) throw new InstallFailure("InvalidPayload");
        var payload = JsonSerializer.Deserialize<Dictionary<string, string>>(payloadJson, Wire.Options) ?? throw new InstallFailure("InvalidPayload");
        if (payload.Count != component.Files.Length) throw new InstallFailure("InvalidPayload");
        string staging = Path.Combine(Root, "staging", Guid.NewGuid().ToString("N"));
        SafeDirectory(staging);
        try
        {
            foreach (ArtifactFile file in component.Files)
            {
                if (!payload.TryGetValue(file.Path, out string? encoded) || encoded is null) throw new InstallFailure("InvalidPayload");
                byte[] bytes = Convert.FromBase64String(encoded);
                if (bytes.Length != file.Bytes || Convert.ToHexStringLower(SHA256.HashData(bytes)) != file.Sha256)
                    throw new InstallFailure("ArtifactMismatch");
                string path = Path.Combine(staging, file.Path);
                using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                output.Write(bytes);
                output.Flush(flushToDisk: true);
            }
            component.CheckModule(Path.Combine(staging, component.EntryAssembly));
            string destination = DirectoryFor(component);
            SafeDirectory(Path.GetDirectoryName(destination)!);
            Directory.Move(staging, destination);
            return true;
        }
        finally { if (Directory.Exists(staging)) Directory.Delete(staging, recursive: true); }
    }

    internal void Activate(Component component)
    {
        string path = MarkerFor(component);
        SafeDirectory(Path.GetDirectoryName(path)!);
        RejectLink(path);
        string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                JsonSerializer.Serialize(file, component, Wire.Options);
                file.Flush(flushToDisk: true);
            }
            File.Move(temporary, path, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    internal static void SafeDirectory(string path)
    {
        RejectAncestors(path);
        Directory.CreateDirectory(path);
        RejectAncestors(path);
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    }

    private static void RejectAncestors(string path)
    {
        for (string? current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current)) RejectLink(current);
    }

    private static void RejectLink(string path)
    {
        if (new FileInfo(path).LinkTarget is not null || new DirectoryInfo(path).LinkTarget is not null ||
            ((File.Exists(path) || Directory.Exists(path)) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0))
            throw new InstallFailure("UnsafePath");
    }
}
