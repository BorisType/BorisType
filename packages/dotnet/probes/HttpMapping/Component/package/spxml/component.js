function init() {
  if (!LdsIsServer) return;
  var id = "BorisType.ComponentMappingProbe";
  var root = AppDirectoryPath() + "/dotnetcore/shared/.bt-http-wrapper-probe/components/" + id;
  var core = tools.dotnet_host.Object.GetAssembly("mscorlib");
  var selection = ParseJson(String(core.CallClassStaticMethod("System.IO.File", "ReadAllText", [root + "/active.json"])));
  if (selection.version != "1.0.0" && selection.version != "2.0.0") throw "Unexpected probe version";
  var simpleName = id + ".V" + selection.version;
  if (selection.id != id || selection.entryAssembly != simpleName + ".dll") throw "Unexpected component";
  var build = selection.buildId;
  var assembly = tools.dotnet_host.Object.GetAssembly(simpleName + ".dll");
  var registered = assembly.CallClassStaticMethod("BorisType.ComponentMappingProbe.Mapping", "Register", [build]);
  if (!registered) throw "Component mapping registration failed";
}
