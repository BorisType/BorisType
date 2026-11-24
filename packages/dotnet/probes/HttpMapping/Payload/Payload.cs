namespace BorisType.HttpProbe;

public static class Payload
{
  public static string? Invoke(string operation)
  {
    string variant = typeof(Payload).Assembly.GetName().Name!.Split('.')[^1];
    return operation switch
    {
      "capabilities" or "hold" => variant,
      "added" when variant == "C" => "only-in-v2",
      _ => null
    };
  }
}
