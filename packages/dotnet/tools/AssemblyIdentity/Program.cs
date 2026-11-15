using BorisType.RuntimeBootstrap;
using System.Text.Json;

if (args.Length != 1) throw new ArgumentException("Expected one managed assembly path");
Console.WriteLine(JsonSerializer.Serialize(ModuleIdentity.Read(args[0]), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
