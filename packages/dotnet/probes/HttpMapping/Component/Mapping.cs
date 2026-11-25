using System.Net;
using System.Reflection;
using Datex.XHTTP;
using logging;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Websoft.Commons;

namespace BorisType.ComponentMappingProbe;

public sealed class Mapping : IDatexHttpMapping
{
    // Called by the HCM component initializer. The public Datex API takes the assembly and type names.
    public static bool Register(string expectedBuildId)
    {
        var type = typeof(Mapping);
        if (type.Assembly.ManifestModule.ModuleVersionId.ToString("D") != expectedBuildId)
            throw new InvalidOperationException("WebSoft resolved a different probe build.");
        return Middleware.RegisterAspNetMapping(type.Assembly.FullName!, type.FullName!);
    }

    public (bool, Exception?) Initialize(IApplicationBuilder app, IEndpointRouteBuilder endpoints,
        Dictionary<string, object> properties, clog log)
    {
        var assembly = typeof(Mapping).Assembly;
        var identity = new
        {
            version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()!.InformationalVersion,
            buildId = assembly.ManifestModule.ModuleVersionId,
            instance = Guid.NewGuid(),
        };
        endpoints.MapGet("/__boristype_component_mapping_probe", (HttpContext context) =>
        {
            var address = context.Connection.RemoteIpAddress;
            if (address == null || !IPAddress.IsLoopback(address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address))
                return Results.NotFound();
            return Results.Json(identity);
        });
        return (true, null);
    }
}
