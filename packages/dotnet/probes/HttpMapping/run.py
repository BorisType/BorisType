"""Run on an already running, disposable single-node Linux HCM Docker stand."""

import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

from verify import HERE, PREFIX, basic_header, exchange, verify

CONFIG = "/WebsoftServer/xhttp_config.json"
ASSEMBLY = "BorisType.HttpMappingProbe.dll"
MAPPING = "/WebsoftServer/dotnetcore/libs/" + ASSEMBLY
LOCK = "/tmp/boristype-http-mapping-probe.lock"


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wait_for_server(container, installed):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            with exchange(container, "/spxml_web/main.htm", basic_header()) as login:
                if login.status != 200:
                    raise ValueError("HCM login is not ready")
            with exchange(container, PREFIX + "v1/identity") as probe:
                if installed and probe.status == 401 and probe.getheader("X-BorisType-Probe"):
                    return
                if not installed and probe.status == 404 and not probe.getheader("X-BorisType-Probe"):
                    return
        except (OSError, ValueError, http.client.HTTPException):
            pass
        time.sleep(1)
    raise RuntimeError(f"HCM readiness timed out (expected mapping installed={installed})")


def build(name, output, *properties):
    subprocess.run(
        ["dotnet", "build", str(HERE / name), "-c", "Release", "-o", str(output), "--nologo", *properties],
        check=True,
        stdout=sys.stderr,
    )


def experiment(container, references, scratch):
    def inside(*args):
        return run("docker", "exec", container, *map(str, args))

    def copy_in(path, destination):
        run("docker", "cp", str(path), f"{container}:{destination}")

    def restart():
        run("docker", "restart", "-t", "20", container)

    metadata = json.loads(run("docker", "inspect", container))[0]
    assert metadata["State"]["Running"], "start this disposable stand first"
    ports = metadata["NetworkSettings"]["Ports"].get("80/tcp") or []
    loopback = next((p for p in ports if p["HostIp"] in ("0.0.0.0", "127.0.0.1")), None)
    assert loopback, "publish the stand's HTTP port 80 on IPv4 loopback"
    os.environ["WSHCM_PORT"] = loopback["HostPort"]
    basic_header()  # catch missing credentials before changing the stand
    wait_for_server(container, installed=False)
    inside("test", "!", "-e", MAPPING)
    original = scratch / "original.json"
    configured = scratch / "configured.json"
    run("docker", "cp", f"{container}:{CONFIG}", str(original))
    properties = {"Directory": str(scratch), "ExpectedLogin": os.environ["WSHCM_USERNAME"]}
    for variant in "ABC":
        output = scratch / variant
        build("Payload", output, "-p:Variant=" + variant)
        dll = scratch / (variant + ".dll")
        shutil.copyfile(output / f"BorisType.HttpProbe.{variant}.dll", dll)
        properties["Hash" + variant] = digest(dll)
    build("Mapping", scratch / "mapping", "-p:WebsoftReferenceDir=" + str(references))
    mapping_config = json.dumps(
        {
            "Enabled": True,
            "Type": "BorisType.HttpProbe.Mapping",
            "Assembly": ASSEMBLY,
            "Properties": properties,
        }
    ).encode()
    contents = original.read_bytes()
    pattern = rb'(?m)^\s*"AspNetMappings"\s*:\s*\['
    assert len(re.findall(pattern, contents)) == 1 and ASSEMBLY.encode() not in contents
    configured.write_bytes(re.sub(pattern, lambda m: m[0] + mapping_config + b",", contents))
    # Keep the original bytes (including comments/encoding) and preserve metadata on the server.
    inside("mkdir", LOCK)
    remote_created = changed = False
    try:
        inside("mkdir", "-m", "700", scratch)
        remote_created = True
        inside("cp", "-a", CONFIG, scratch / "original.json")
        assert inside("sha256sum", CONFIG).split()[0] == digest(original)
        copy_in(configured, scratch / "configured.json")
        changed = True
        copy_in(scratch / "mapping" / ASSEMBLY, MAPPING)
        inside("cp", scratch / "configured.json", CONFIG)
        # Putting both files in place does not register a mapping in the running process.
        with exchange(container, PREFIX + "v1/identity") as before:
            assert before.status == 404 and not before.getheader("X-BorisType-Probe")
        restart()
        wait_for_server(container, installed=True)

        def restart_with_fixture():
            restart()
            wait_for_server(container, installed=True)

        result = verify(container, scratch, restart_with_fixture)
    finally:
        if changed:
            inside("cp", "-a", scratch / "original.json", CONFIG)
            assert inside("sha256sum", CONFIG).split()[0] == digest(original)
            inside("rm", "-f", MAPPING)
            restart()
            wait_for_server(container, installed=False)
            inside("test", "!", "-e", MAPPING)
        if remote_created:
            inside("find", scratch, "-depth", "-delete")
        inside("rmdir", LOCK)
    return {**result, "beforeInitialRestart": 404, "restoredConfigSha256": digest(original)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "container", help="running dedicated HCM application container, restarted three times"
    )
    parser.add_argument(
        "reference_dir", type=Path, help="directory containing Websoft.Commons.dll and Datex.log.dll"
    )
    args = parser.parse_args()
    if not __debug__:
        parser.error("run with Python assertions enabled")
    scratch = Path(tempfile.mkdtemp(prefix="bt-kestrel-", dir="/tmp"))
    try:
        result = experiment(args.container, args.reference_dir.resolve(), scratch)
    except BaseException:
        print(f"Probe failed. Local recovery files retained in {scratch}.", file=sys.stderr)
        raise
    else:
        shutil.rmtree(scratch)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
