using System.Net;
using System.Security.Claims;
using System.Runtime.Loader;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.Primitives;
using Websoft.Commons;
using logging;

namespace BorisType.HttpProbe;

// Local diagnostic fixture. Only the three digests in the startup configuration may execute.
public sealed class Mapping : IDatexHttpMapping
{
  private const string Prefix = "/__boristype_mapping_probe";
  private readonly string instance = Guid.NewGuid().ToString("N");
  private readonly LateEndpoint late = new();
  private readonly Slot v1 = new(), v2 = new();
  private readonly TaskCompletionSource publishedB = new(TaskCreationOptions.RunContinuationsAsynchronously);
  private string directory = "";
  private string expectedLogin = "";
  private Dictionary<string, string> approved = new();

  public (bool, Exception?) Initialize(IApplicationBuilder app, IEndpointRouteBuilder endpoints, Dictionary<string, object> properties, clog log)
  {
    directory = Path.GetFullPath((string)properties["Directory"]);
    expectedLogin = (string)properties["ExpectedLogin"];
    approved = new[] { "A", "B", "C" }.ToDictionary(id => id, id => (string)properties["Hash" + id]);
    endpoints.DataSources.Add(late);
    endpoints.Map(Prefix + "/{**rest}", Dispatch);
    return (true, null);
  }

  private bool Local(HttpContext context)
  {
    var address = context.Connection.RemoteIpAddress;
    if (address is null || !IPAddress.IsLoopback(address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address))
    {
      context.Response.StatusCode = 404;
      return false;
    }
    context.Response.Headers["X-BorisType-Probe"] = instance;
    context.Response.Headers.CacheControl = "no-store";
    if (context.Request.Method == "GET") return true;
    context.Response.StatusCode = 405;
    context.Response.Headers.Allow = "GET";
    return false;
  }

  private async Task Dispatch(HttpContext context)
  {
    if (!Local(context)) return;
    string[] parts = (context.Request.RouteValues["rest"]?.ToString() ?? "").Split('/');
    if (parts.Length != 2 || parts[0] is not ("v1" or "v2")) { context.Response.StatusCode = 404; return; }
    if (parts[1] == "identity")
    {
      var identities = context.User.Identities.ToArray();
      var authenticated = identities.Where(i => i.IsAuthenticated).ToArray();
      bool hasName = authenticated.Any(i => !string.IsNullOrEmpty(i.Name));
      bool hasSubject = authenticated.Any(i => i.HasClaim(c => (c.Type == ClaimTypes.NameIdentifier || c.Type == "sub") && !string.IsNullOrEmpty(c.Value)));
      context.Response.StatusCode = authenticated.Length == 0 ? 401 : hasName || hasSubject ? 200 : 403;
      await context.Response.WriteAsJsonAsync(new
      {
        identities = identities.Length,
        authenticated = authenticated.Length,
        hasName,
        hasSubject,
        claims = identities.Sum(i => i.Claims.Count()),
        matchesFixtureLogin = authenticated.Any(i => string.Equals(i.Name, expectedLogin, StringComparison.OrdinalIgnoreCase))
      });
      return;
    }
    if (parts[1] is not ("capabilities" or "hold" or "added")) { context.Response.StatusCode = 404; return; }

    // These loopback-only fixtures expose constants. No session, file access API or BS execution endpoint.
    bool second = parts[0] == "v2";
    var slot = second ? v2 : v1;
    Build build;
    lock (slot)
    {
      if (parts[1] == "capabilities" || slot.Current is null)
      {
        var prefix = Path.Combine(directory, parts[0]);
        try
        {
          var candidate = ReadBuild(slot, second, prefix + ".active");
          if (slot.Current != candidate)
          {
            // Record what actually loaded, independently of the installer’s desired version.
            File.WriteAllText(prefix + ".tmp", candidate.Id);
            File.Move(prefix + ".tmp", prefix + ".last-good", true);
            slot.Current = candidate;
          }
        }
        catch (IOException error)
        {
          context.Response.Headers["X-Probe-Update"] = error is RejectedBuild ? "rejected" : "unavailable";
          if (slot.Current is null)
          {
            try
            {
              slot.Current = ReadBuild(slot, second, prefix + ".last-good");
            }
            catch (IOException)
            {
              context.Response.StatusCode = error is RejectedBuild ? 409 : 503;
              return;
            }
          }
        }
        if (second) late.Publish(ReplyLate);
        if (slot.Current.Id == "B") publishedB.TrySetResult();
      }
      build = slot.Current!;
      context.Response.Headers["X-Probe-Loads"] = slot.Loaded.Count.ToString();
    }
    string? value = build.Invoke(parts[1]);
    if (value is null) { context.Response.StatusCode = 404; return; }
    if (parts[1] == "hold")
    {
      await context.Response.WriteAsync("started:" + value + "\n");
      await context.Response.Body.FlushAsync(context.RequestAborted);
      await publishedB.Task.WaitAsync(TimeSpan.FromSeconds(25), context.RequestAborted);
    }
    await context.Response.WriteAsync(build.Invoke(parts[1])!);
  }

  private Build ReadBuild(Slot slot, bool second, string manifest)
  {
    string id = File.ReadAllText(manifest).Trim();
    if (second ? id != "C" : id is not ("A" or "B")) throw new RejectedBuild();
    if (slot.Loaded.TryGetValue(id, out var cached)) return cached;
    byte[] data = File.ReadAllBytes(Path.Combine(directory, id + ".dll"));
    if (!Convert.ToHexString(SHA256.HashData(data)).Equals(approved[id], StringComparison.OrdinalIgnoreCase))
      throw new RejectedBuild();
    using var stream = new MemoryStream(data);
    var assembly = AssemblyLoadContext.GetLoadContext(typeof(Mapping).Assembly)!.LoadFromStream(stream);
    var handler = assembly.GetType("BorisType.HttpProbe.Payload", true)!.GetMethod("Invoke")!
        .CreateDelegate<Func<string, string?>>();
    if (handler("capabilities") != id) throw new RejectedBuild();
    var build = new Build(id, handler);
    slot.Loaded.Add(id, build);
    return build;
  }

  private sealed class RejectedBuild : IOException { }

  private Task ReplyLate(HttpContext context) =>
      Local(context) ? context.Response.WriteAsync("late-endpoint") : Task.CompletedTask;

  private sealed record Build(string Id, Func<string, string?> Invoke);
  private sealed class Slot
  {
    public readonly Dictionary<string, Build> Loaded = new();
    public Build? Current;
  }

  // Separate URL outside the dispatcher. The pre-existing matcher must observe the change token.
  private sealed class LateEndpoint : EndpointDataSource
  {
    private sealed record State(Endpoint[] Entries, CancellationTokenSource Changed);
    private State state = new([], new());
    public override IReadOnlyList<Endpoint> Endpoints => Volatile.Read(ref state).Entries;
    public override IChangeToken GetChangeToken() => new CancellationChangeToken(Volatile.Read(ref state).Changed.Token);
    public void Publish(RequestDelegate handler)
    {
      var old = Volatile.Read(ref state);
      if (old.Entries.Length > 0) return;
      var route = new RouteEndpoint(handler, RoutePatternFactory.Parse("/__boristype_late_endpoint_probe"), 0,
          EndpointMetadataCollection.Empty, "BorisType late endpoint probe");
      Volatile.Write(ref state, new State([route], new()));
      old.Changed.Cancel();
    }
  }
}
