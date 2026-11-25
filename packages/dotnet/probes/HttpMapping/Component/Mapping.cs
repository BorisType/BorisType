using System.Net;
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
    public static bool Register()
    {
        var type = typeof(Mapping);
        return Middleware.RegisterAspNetMapping(type.Assembly.FullName!, type.FullName!);
    }

    public (bool, Exception?) Initialize(IApplicationBuilder app, IEndpointRouteBuilder endpoints,
        Dictionary<string, object> properties, clog log)
    {
        endpoints.MapGet("/__boristype_component_mapping_probe", (HttpContext context) =>
        {
            var address = context.Connection.RemoteIpAddress;
            if (address == null || !IPAddress.IsLoopback(address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address))
                return Results.NotFound();
            return Results.Text("boristype-component-mapped");
        });
        return (true, null);
    }
}
