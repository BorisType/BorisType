function init() {
  if (!LdsIsServer) return;
  var dll = "/components/bt_http_mapping_probe/bin/BorisType.ComponentMappingProbe.dll";
  var assembly = tools.dotnet_host.Object.GetAssembly(AppDirectoryPath() + dll);
  var registered = assembly.CallClassStaticMethod("BorisType.ComponentMappingProbe.Mapping", "Register", []);
  alert("BorisType component mapping probe registration: " + registered);
}
