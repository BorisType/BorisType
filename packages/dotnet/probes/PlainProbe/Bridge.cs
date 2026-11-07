using System.Runtime.InteropServices;
using System.Text.Json;

namespace BorisType.Probes;

/// <summary>Bounded bridge checks without references to WebSoft assemblies.</summary>
public static class PlainBridge
{
    /// <summary>Verifies a static invocation without arguments.</summary>
    public static string Ping() => "pong";

    /// <summary>Returns text unchanged; the BS carrier must encode it for SOAP.</summary>
    public static string Echo(string value) => value;

    /// <summary>Returns JSON text without exposing managed objects to the BS bridge.</summary>
    public static string Encode(string? value) => JsonSerializer.Serialize(value);

    /// <summary>Checks binding of BS integers to managed Int64 arguments.</summary>
    public static long Add(long left, long right) => checked(left + right);

    /// <summary>Checks boolean argument and return binding.</summary>
    public static bool Negate(bool value) => !value;

    /// <summary>Checks whether a BS null reaches a nullable managed parameter.</summary>
    public static bool IsNull(string? value) => value is null;

    /// <summary>Reports the CLR hosting this call, rather than the build environment.</summary>
    public static string Describe() => JsonSerializer.Serialize(new
    {
        framework = RuntimeInformation.FrameworkDescription,
        os = RuntimeInformation.OSDescription,
        architecture = RuntimeInformation.ProcessArchitecture.ToString(),
        assembly = typeof(PlainBridge).Assembly.GetName().Name,
    });

    /// <summary>Produces a recognisable exception to test BS catch and recovery.</summary>
    public static string Fail() => throw new InvalidOperationException("BT_PROBE_EXPECTED_FAILURE");
}
