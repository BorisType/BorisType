"""Run on a fresh disposable, single-network Linux HCM container. The runner restarts it twice."""

import argparse
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
DOTNET = HERE.parents[2]
SDK = DOTNET.parent / "ws-client"
sys.path.insert(0, str(HERE.parent))
from verify import basic_header, exchange  # noqa: E402

COMPONENT = "BorisType.ComponentMappingProbe"
ROUTE = "/__boristype_component_mapping_probe"
ROOT = "/WebsoftServer/dotnetcore/shared/.bt-http-wrapper-probe"
STORE = ROOT + "/components/" + COMPONENT


def command(*args, **kwargs):
    return subprocess.check_output(args, text=True, timeout=120, **kwargs).strip()


def bundle_for(version, references, scratch):
    output = scratch / version
    name = COMPONENT + ".V" + version
    dll = name + ".dll"
    command(
        "dotnet", "build", str(HERE / "Component.csproj"), "-c", "Release", "-p:Version=" + version,
        "-p:WebsoftReferenceDir=" + str(references), "--artifacts-path", str(scratch / ("build-" + version)),
        "-o", str(output / "component"), "--nologo",
    )
    assembly = output / "component" / dll
    identity_tool = DOTNET / "tools/AssemblyIdentity/bin/Release/net9.0/AssemblyIdentity.dll"
    descriptor = json.loads(command("dotnet", str(identity_tool), str(assembly)))
    assert descriptor["id"] == name and descriptor["version"] == version and descriptor["apiVersion"] == 1
    assert descriptor["targetFramework"] == ".NETCoreApp,Version=v9.0"
    digest = hashlib.sha256(assembly.read_bytes()).hexdigest()
    descriptor.update(
        id=COMPONENT, targetFramework="net9.0", entryAssembly=dll,
        files=[{"path": dll, "bytes": assembly.stat().st_size, "sha256": digest}],
    )
    source = SDK / "resources/dotnet"
    manifest = json.loads((source / "manifest.json").read_text())
    shutil.copytree(source / "bootstrap", output / "bootstrap")
    manifest["component"] = descriptor
    (output / "manifest.json").write_text(json.dumps(manifest))
    return descriptor


def experiment(container, references, scratch):
    def inside(*args):
        return command("docker", "exec", container, *args)

    def live():
        with exchange(container, ROUTE) as response:
            if response.status == 404:
                return None
            assert response.status == 200, ("loopback diagnostic", response.status)
            return json.load(response)

    def wait_for_hcm():
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            try:
                with exchange(container, "/spxml_web/main.htm", basic_header()) as response:
                    if response.status == 200:
                        return
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(1)
        raise RuntimeError("HCM did not answer the authenticated readiness check")

    def stage(version, action="stage"):
        return json.loads(command("node", str(HERE / "stage.mjs"), str(scratch / version), action, env=env))

    def assert_live(descriptor):
        reply = live()
        assert reply and reply["version"] == descriptor["version"] and reply["buildId"] == descriptor["buildId"], reply
        return reply

    def verify_file(descriptor):
        path = STORE + "/" + descriptor["version"] + "-" + descriptor["buildId"] + "/" + descriptor["entryAssembly"]
        assert inside("sha256sum", path).split()[0] == descriptor["files"][0]["sha256"]

    basic_header()
    networks = json.loads(command("docker", "inspect", "-f", "{{json .NetworkSettings.Networks}}", container))
    (network,) = networks.values()
    host = str(ipaddress.IPv4Address(network["IPAddress"]))
    env = dict(os.environ, WSHCM_HOST=host, NO_PROXY=host, no_proxy=host, NODE_USE_ENV_PROXY="0")
    v1, v2 = (bundle_for(version, references, scratch) for version in ("1.0.0", "2.0.0"))
    marker = STORE + "/active.json"
    config = "/WebsoftServer/xhttp_config.json"
    component_path = "/WebsoftServer/components/bt_http_mapping_probe"
    inside("test", "!", "-e", component_path)
    inside("test", "!", "-e", ROOT)
    config_before = inside("sha256sum", config)
    wait_for_hcm()
    assert live() is None
    first = stage(v1["version"], "install")
    startup_files = [component_path + "/" + name for name in ("package.json", "spxml/component.xml", "spxml/component.js")]
    stable_hashes = inside("sha256sum", *startup_files)
    assert first["installed"]["buildId"] == v1["buildId"] and first["loaded"] is None
    assert live() is None
    command("docker", "restart", "-t", "20", container)
    wait_for_hcm()
    old = assert_live(v1)
    prepared = stage(v2["version"])
    assert prepared["installed"]["buildId"] == v2["buildId"]
    assert prepared["loaded"]["buildId"] == v1["buildId"], prepared
    assert live() == old
    verify_file(v1)
    verify_file(v2)
    older_client = stage(v1["version"])
    assert not older_client["changed"] and older_client["installed"]["buildId"] == v2["buildId"]
    assert json.loads(inside("cat", marker))["buildId"] == v2["buildId"]
    assert live() == old
    command("docker", "restart", "-t", "20", container)
    wait_for_hcm()
    new = assert_live(v2)
    assert new["instance"] != old["instance"]
    verify_file(v1)
    verify_file(v2)
    assert config_before == inside("sha256sum", config)
    assert stable_hashes == inside("sha256sum", *startup_files)
    return {
        "beforeFirstRestart": 404, "runningBeforeAndAfterStage": old, "prepared": v2["version"],
        "olderClientChanged": older_client["changed"], "afterRestart": new, "configSha256": config_before.split()[0],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("container")
    parser.add_argument("references", type=Path)
    args = parser.parse_args()
    if not __debug__:
        parser.error("run with Python assertions enabled")
    with tempfile.TemporaryDirectory(prefix="bt-wrapper-build-") as directory:
        print(json.dumps(experiment(args.container, args.references.resolve(), Path(directory)), indent=2))
