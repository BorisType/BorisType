using Datex.Global;
using System.Text.Json;

namespace BorisType.Probes;

/// <summary>Checks an explicit compile-time reference to the target platform.</summary>
public static class DatexBridge
{
    /// <summary>Reports the assembly supplying the platform integration types.</summary>
    public static string DescribeReference() => JsonSerializer.Serialize(new
    {
        assembly = typeof(DatexGlobal).Assembly.GetName().Name,
        version = typeof(DatexGlobal).Assembly.GetName().Version?.ToString(),
    });

    /// <summary>Checks whether the host supplies the trailing platform context.</summary>
    public static bool HasContext(DatexGlobal context) => context is not null;

    /// <summary>Calls the platform JSON encoder through its supplied context.</summary>
    public static string EncodeViaPlatform(string value, DatexGlobal context) => context.EncodeJson(value);
}
