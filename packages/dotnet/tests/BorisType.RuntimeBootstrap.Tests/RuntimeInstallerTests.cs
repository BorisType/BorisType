using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using BorisType.RuntimeBootstrap;
using Xunit;

namespace BorisType.RuntimeBootstrap.Tests;

public sealed class RuntimeInstallerTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "boristype-runtime-" + Guid.NewGuid().ToString("N"));
    private readonly List<AssemblyLoadContext> contexts = [];

    private RuntimeInstaller Installer()
    {
        var context = new AssemblyLoadContext("runtime-test-" + Guid.NewGuid(), isCollectible: true);
        contexts.Add(context);
        return new RuntimeInstaller(root, context);
    }

    private static (string Manifest, string Payload, string BuildId) Fixture(string name)
    {
        byte[] bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures", name, "BorisType.RuntimeFixture.dll"));
        using var pe = new PEReader(new MemoryStream(bytes));
        MetadataReader metadata = pe.GetMetadataReader();
        string buildId = metadata.GetGuid(metadata.GetModuleDefinition().Mvid).ToString("D");
        string version = name == "v2" ? "1.1.0" : "1.0.0";
        return (JsonSerializer.Serialize(new
        {
            id = "BorisType.RuntimeFixture", version, apiVersion = 2, targetFramework = "net9.0", buildId,
            entryAssembly = "BorisType.RuntimeFixture.dll",
            files = new[] { new { path = "BorisType.RuntimeFixture.dll", bytes = bytes.Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(bytes)) } },
        }), JsonSerializer.Serialize(new Dictionary<string, string> { ["BorisType.RuntimeFixture.dll"] = Convert.ToBase64String(bytes) }), buildId);
    }

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void Fresh_install_activates_verified_bytes_and_reports_loaded_module_identity()
    {
        var fixture = Fixture("v1");
        JsonElement result = Body(Installer().EnsureJson(fixture.Manifest, fixture.Payload));
        Assert.Equal("ready", result.GetProperty("status").GetString());
        Assert.Equal(fixture.BuildId, result.GetProperty("loaded").GetProperty("buildId").GetString());
        Assert.True(result.GetProperty("changed").GetBoolean());
        string installed = Assert.Single(Directory.GetFiles(root, "BorisType.RuntimeFixture.dll", SearchOption.AllDirectories));
        Assert.Equal(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures/v1/BorisType.RuntimeFixture.dll")), File.ReadAllBytes(installed));
    }

    [Fact]
    public void Corrupt_payload_cannot_publish_or_load_a_component()
    {
        var fixture = Fixture("v1");
        string bad = JsonSerializer.Serialize(new Dictionary<string, string> { ["BorisType.RuntimeFixture.dll"] = "YWJj" });
        JsonElement result = Body(Installer().EnsureJson(fixture.Manifest, bad));
        Assert.Equal("blocked", result.GetProperty("status").GetString());
        Assert.Equal("ArtifactMismatch", result.GetProperty("reason").GetString());
        Assert.Null(result.GetProperty("loaded").GetString());
        Assert.Empty(Directory.Exists(root) ? Directory.GetFiles(root, "BorisType.RuntimeFixture.dll", SearchOption.AllDirectories) : []);
    }

    [Fact]
    public void New_files_do_not_claim_that_a_cached_old_module_was_replaced()
    {
        var old = Fixture("v1");
        var next = Fixture("v2");
        var installer = Installer();
        Assert.Equal("ready", Body(installer.EnsureJson(old.Manifest, old.Payload)).GetProperty("status").GetString());
        JsonElement result = Body(installer.EnsureJson(next.Manifest, next.Payload));
        Assert.Equal("restart_required", result.GetProperty("status").GetString());
        Assert.Equal(old.BuildId, result.GetProperty("loaded").GetProperty("buildId").GetString());
        Assert.Equal(next.BuildId, result.GetProperty("installed").GetProperty("buildId").GetString());
        Assert.Equal(2, Directory.GetFiles(root, "BorisType.RuntimeFixture.dll", SearchOption.AllDirectories).Length);
    }

    [Fact]
    public void Same_version_with_changed_module_is_not_reported_as_current()
    {
        var old = Fixture("v1");
        var changed = Fixture("v1-alt");
        var installer = Installer();
        installer.EnsureJson(old.Manifest, old.Payload);
        JsonElement result = Body(installer.EnsureJson(changed.Manifest, changed.Payload));
        Assert.Equal("blocked", result.GetProperty("status").GetString());
        Assert.Equal("BuildConflict", result.GetProperty("reason").GetString());
        Assert.NotEqual(result.GetProperty("expected").GetProperty("buildId").GetString(), result.GetProperty("loaded").GetProperty("buildId").GetString());
    }

    [Fact]
    public void A_new_process_can_activate_prepared_update_and_an_older_client_does_not_downgrade_it()
    {
        var old = Fixture("v1");
        var next = Fixture("v2");
        var first = Installer();
        first.EnsureJson(old.Manifest, old.Payload);
        first.EnsureJson(next.Manifest, next.Payload);
        var restarted = Installer();
        JsonElement result = Body(restarted.EnsureJson(old.Manifest, old.Payload));
        Assert.Equal("ready", result.GetProperty("status").GetString());
        Assert.Equal(next.BuildId, result.GetProperty("loaded").GetProperty("buildId").GetString());
    }

    [Fact]
    public async Task Concurrent_matching_installs_publish_one_complete_immutable_version()
    {
        var fixture = Fixture("v1");
        RuntimeInstaller a = Installer(), b = Installer();
        string[] results = await Task.WhenAll(Task.Run(() => a.EnsureJson(fixture.Manifest, fixture.Payload)), Task.Run(() => b.EnsureJson(fixture.Manifest, fixture.Payload)));
        Assert.All(results, json => Assert.Equal("ready", Body(json).GetProperty("status").GetString()));
        Assert.Single(Directory.GetFiles(root, "BorisType.RuntimeFixture.dll", SearchOption.AllDirectories));
    }

    [Fact]
    public void Incorrect_descriptor_version_or_api_cannot_publish_an_active_marker_or_load_code()
    {
        var fixture = Fixture("v1");
        var installer = Installer();
        foreach (string manifest in new[] { fixture.Manifest.Replace("1.0.0", "1.9.0"), fixture.Manifest.Replace("\"apiVersion\":2", "\"apiVersion\":3") })
        {
            JsonElement result = Body(installer.EnsureJson(manifest, fixture.Payload));
            Assert.Equal("blocked", result.GetProperty("status").GetString());
            Assert.Equal("ArtifactMismatch", result.GetProperty("reason").GetString());
            Assert.Equal(JsonValueKind.Null, result.GetProperty("loaded").ValueKind);
            Assert.Empty(Directory.GetFiles(root, "active.json", SearchOption.AllDirectories));
            Assert.DoesNotContain(contexts[^1].Assemblies, a => a.GetName().Name == "BorisType.RuntimeFixture");
        }
    }

    [Fact]
    public void Invalid_manifest_path_and_metadata_are_rejected_before_publication()
    {
        var fixture = Fixture("v1");
        foreach (string manifest in new[] { fixture.Manifest.Replace("BorisType.RuntimeFixture.dll", "../escape.dll"), fixture.Manifest.Replace("net9.0", "net8.0"), fixture.Manifest.Replace(fixture.BuildId, Guid.Empty.ToString("D")) })
        {
            JsonElement result = Body(Installer().EnsureJson(manifest, fixture.Payload));
            Assert.Equal("blocked", result.GetProperty("status").GetString());
        }
        Assert.Empty(Directory.Exists(root) ? Directory.GetFiles(root, "*.dll", SearchOption.AllDirectories) : []);
    }

    [Fact]
    public void Inspect_does_not_load_a_missing_component()
    {
        var fixture = Fixture("v1");
        JsonElement result = Body(Installer().InspectJson(fixture.Manifest));
        Assert.Equal("missing", result.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("loaded").ValueKind);
        Assert.DoesNotContain(contexts[^1].Assemblies, a => a.GetName().Name == "BorisType.RuntimeFixture");
    }

    [Fact]
    public void Foreign_invalid_api_metadata_is_reported_as_unknown_without_losing_loaded_identity()
    {
        var fixture = Fixture("v1");
        var installer = Installer();
        var assembly = contexts[^1].LoadFromAssemblyPath(Path.Combine(AppContext.BaseDirectory, "fixtures/unknown-api/BorisType.RuntimeFixture.dll"));
        JsonElement result = Body(installer.EnsureJson(fixture.Manifest, fixture.Payload));
        Assert.Equal("blocked", result.GetProperty("status").GetString());
        Assert.Equal("IncompatibleApi", result.GetProperty("reason").GetString());
        Assert.Equal(0, result.GetProperty("loaded").GetProperty("apiVersion").GetInt32());
        Assert.Equal(assembly.ManifestModule.ModuleVersionId.ToString("D"), result.GetProperty("loaded").GetProperty("buildId").GetString());
    }

    [Fact]
    public void An_older_client_does_not_install_old_bytes_over_an_externally_loaded_newer_component()
    {
        var fixture = Fixture("v1");
        var installer = Installer();
        contexts[^1].LoadFromAssemblyPath(Path.Combine(AppContext.BaseDirectory, "fixtures/v2/BorisType.RuntimeFixture.dll"));
        JsonElement result = Body(installer.EnsureJson(fixture.Manifest, fixture.Payload));
        Assert.Equal("ready", result.GetProperty("status").GetString());
        Assert.Equal("NewerCompatible", result.GetProperty("reason").GetString());
        Assert.Empty(Directory.GetFiles(root, "BorisType.RuntimeFixture.dll", SearchOption.AllDirectories));
        Assert.False(result.GetProperty("changed").GetBoolean());
    }

    [Fact]
    public void Concurrent_versions_in_one_host_context_never_report_a_generic_loader_failure()
    {
        var first = Fixture("v1");
        var next = Fixture("v2");
        var installer = Installer();
        using var start = new ManualResetEventSlim();
        string? a = null, b = null;
        var one = new Thread(() => { start.Wait(); a = installer.EnsureJson(first.Manifest, first.Payload); });
        var two = new Thread(() => { start.Wait(); b = installer.EnsureJson(next.Manifest, next.Payload); });
        one.Start(); two.Start(); start.Set(); one.Join(); two.Join();
        Assert.All(new[] { a!, b! }, json => Assert.Contains(Body(json).GetProperty("status").GetString(), new[] { "ready", "restart_required" }));
    }

    [Fact]
    public async Task An_external_host_load_during_install_is_reported_with_its_actual_identity()
    {
        var fixture = Fixture("v2");
        var installer = Installer();
        var manifest = JsonNode.Parse(fixture.Manifest)!;
        var payload = JsonNode.Parse(fixture.Payload)!;
        byte[] padding = new byte[3 * 1024 * 1024];
        foreach (string name in new[] { "one.bin", "two.bin" })
        {
            manifest["files"]!.AsArray().Add(JsonSerializer.SerializeToNode(new
            { path = name, bytes = padding.Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(padding)) }));
            payload[name] = Convert.ToBase64String(padding);
        }
        var context = contexts[^1];
        Task load = Task.Run(() =>
        {
            Assert.True(SpinWait.SpinUntil(() => Directory.Exists(Path.Combine(root, "staging")), TimeSpan.FromSeconds(10)));
            context.LoadFromAssemblyPath(Path.Combine(AppContext.BaseDirectory, "fixtures/v1/BorisType.RuntimeFixture.dll"));
        }, TestContext.Current.CancellationToken);
        JsonElement result = Body(installer.EnsureJson(manifest.ToJsonString(), payload.ToJsonString()));
        await load;
        Assert.Equal("restart_required", result.GetProperty("status").GetString());
        Assert.Equal(Fixture("v1").BuildId, result.GetProperty("loaded").GetProperty("buildId").GetString());
        Assert.Equal(fixture.BuildId, result.GetProperty("installed").GetProperty("buildId").GetString());
    }

    [Fact]
    public void Corrupt_immutable_installation_is_not_loaded_or_overwritten()
    {
        var fixture = Fixture("v1");
        string path = Path.Combine(root, "components", "BorisType.RuntimeFixture", "1.0.0-" + fixture.BuildId);
        Directory.CreateDirectory(path);
        File.WriteAllText(Path.Combine(path, "BorisType.RuntimeFixture.dll"), "corrupt");
        JsonElement result = Body(Installer().EnsureJson(fixture.Manifest, fixture.Payload));
        Assert.Equal("blocked", result.GetProperty("status").GetString());
        Assert.Equal("CorruptInstallation", result.GetProperty("reason").GetString());
        Assert.Equal("corrupt", File.ReadAllText(Path.Combine(path, "BorisType.RuntimeFixture.dll")));
        Assert.Equal(JsonValueKind.Null, result.GetProperty("loaded").ValueKind);
    }

    [Fact]
    public void Symlinked_managed_root_is_rejected_without_writing_its_destination()
    {
        if (OperatingSystem.IsWindows()) return; // Windows link privileges are not implied by managed CI.
        string destination = root + "-target";
        Directory.CreateDirectory(destination);
        try
        {
            Directory.CreateSymbolicLink(root, destination);
            var fixture = Fixture("v1");
            JsonElement result = Body(Installer().EnsureJson(fixture.Manifest, fixture.Payload));
            Assert.Equal("blocked", result.GetProperty("status").GetString());
            Assert.Equal("UnsafePath", result.GetProperty("reason").GetString());
            Assert.Empty(Directory.GetFileSystemEntries(destination));
        }
        finally { Directory.Delete(root); Directory.Delete(destination); }
    }

    public void Dispose()
    {
        foreach (var context in contexts) context.Unload();
        GC.Collect();
        GC.WaitForPendingFinalizers();
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }
}
