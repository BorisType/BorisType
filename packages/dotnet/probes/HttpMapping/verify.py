"""Exercise the installed loopback-only fixture. Invoke from run.py on a dedicated Linux Docker stand."""

import base64
import contextlib
import http.client
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREFIX = "/__boristype_mapping_probe/"
LATE = "/__boristype_late_endpoint_probe"


class PipeSocket:
    def __init__(self, pipe):
        self.pipe = pipe

    def makefile(self, *args, **kwargs):
        return self.pipe


@contextlib.contextmanager
def exchange(container, path, headers=None, method="GET"):
    # Connect from the HCM network namespace; the fixture rejects external addresses.
    cmd = [
        "docker",
        "exec",
        "-i",
        container,
        "timeout",
        "40",
        "bash",
        "-c",
        "exec 3<>/dev/tcp/127.0.0.1/80 && cat >&3 && cat <&3",
    ]
    with subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as p:
        response = None
        try:
            lines = [f"{method} {path} HTTP/1.1", "Host: localhost", "Connection: close"]
            lines.extend(f"{k}: {v}" for k, v in (headers or {}).items())
            p.stdin.write(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))
            p.stdin.close()
            response = http.client.HTTPResponse(PipeSocket(p.stdout))
            response.begin()
            yield response
        finally:
            if response is not None:
                response.close()
            p.stdout.close()
            if p.poll() is None:
                p.terminate()


def basic_header():
    credentials = os.environ["WSHCM_USERNAME"] + ":" + os.environ["WSHCM_PASSWORD"]
    return {"Authorization": "Basic " + base64.b64encode(credentials.encode()).decode()}


def identity_sample(container, headers):
    with exchange(container, PREFIX + "v1/identity", headers) as response:
        assert response.getheader("X-BorisType-Probe") and response.status in (200, 401, 403)
        return {"status": response.status, **json.load(response)}


def verify(container, directory, restart_with_fixture):
    directory = Path(directory)
    observations = {}
    instance = None

    def get(path, headers=None, method="GET"):
        with exchange(container, path, headers, method) as response:
            return (
                response.status,
                dict((k.lower(), v) for k, v in response.getheaders()),
                response.read(65536),
            )

    def probe(path, status, body=None, headers=None, method="GET"):
        nonlocal instance
        code, reply, data = get(PREFIX + path, headers, method)
        assert code == status and reply.get("x-boristype-probe"), (path, code, status)
        if instance is None:
            instance = reply["x-boristype-probe"]
        assert instance == reply["x-boristype-probe"], "mapping restarted"
        if body is not None:
            assert data.decode() == body, (path, code, len(data))
        return reply

    def install(name, value="ok", sample_identity=False):
        args = ["node", str(HERE / "install-fixture.mjs"), str(directory), name, value]
        if sample_identity:
            args.append(container)
        result = subprocess.run(args, check=True, timeout=55, stdout=subprocess.PIPE)
        if sample_identity:
            return json.loads(result.stdout)

    basic = basic_header()
    with exchange(container, "/spxml_web/main.htm", basic) as login:
        assert login.status == 200, ("SDK login", login.status)
        cookies = "; ".join(v.split(";", 1)[0] for k, v in login.getheaders() if k.lower() == "set-cookie")
        assert cookies, "reference login returned no cookie"
    auth_results = {}
    for kind, headers in [
        ("anonymous", {}),
        ("basic", basic),
        ("cookie", {"Cookie": cookies}),
        ("basic_and_cookie", {**basic, "Cookie": cookies}),
    ]:
        auth_results[kind] = identity_sample(container, headers)
    assert all(sample["status"] == 401 and sample["authenticated"] == 0 for sample in auth_results.values())
    with exchange(container, "/$hcm/checkmessages?timestamp=0", {**basic, "Cookie": cookies}) as vendor:
        assert vendor.status == 403
        observations["vendorCheckMessagesStatus"] = vendor.status
    # Portal login is a different native entry point from the SDK's SP-XML login.
    with exchange(container, "/home", basic) as portal:
        assert portal.status == 200, ("portal login", portal.status)
        portal_cookies = dict(
            v.split(";", 1)[0].split("=", 1) for k, v in portal.getheaders() if k.lower() == "set-cookie"
        )
    portal_id = portal_cookies.get("x-auth-id")
    observations["portalIssuedXAuthId"] = bool(portal_id)
    assert portal_id, "reference portal did not issue its authentication cookie"
    # Send only the server-issued authentication cookie. No stored-password or native session cookies.
    portal_header = {"Cookie": "x-auth-id=" + portal_id}
    auth_results["portal_x_auth_id_only"] = identity_sample(container, portal_header)
    actor = auth_results["portal_x_auth_id_only"]
    assert (
        actor["status"] == 200
        and actor["authenticated"]
        and actor["matchesFixtureLogin"]
        and actor["hasSubject"]
    )
    with exchange(container, "/$hcm/checkmessages?timestamp=0", portal_header) as vendor:
        assert vendor.status == 200
        observations["vendorWithPortalCookieStatus"] = vendor.status
    assert identity_sample(container, {})["status"] == 401, "previous principal leaked to anonymous client"
    observations["identity"] = {"loginStatus": 200, "cookieReceived": bool(cookies), "requests": auth_results}

    probe("v1/capabilities", 503)
    probe("unknown", 404)
    probe("v3/capabilities", 404)
    assert probe("v1/capabilities", 405, method="POST")["allow"] == "GET"
    before, meta, _ = get(LATE)
    assert before == 404 and "x-boristype-probe" not in meta, ("initial late endpoint", before)
    auth_results["sdk_after_soap"] = install("A.dll", sample_identity=True)
    assert auth_results["sdk_after_soap"]["status"] == 401
    install("v1.active", "A")
    assert probe("v1/capabilities", 200, "A")["x-probe-loads"] == "1"
    probe("v1/added", 404)
    probe("v2/capabilities", 503)
    install("v2.active", "C")
    install("C.dll", "broken")
    probe("v2/capabilities", 409)
    probe("v1/capabilities", 200, "A")

    install("C.dll")
    with ThreadPoolExecutor(max_workers=8) as pool:
        counts = list(pool.map(lambda _: probe("v2/capabilities", 200, "C")["x-probe-loads"], range(8)))
    assert counts == ["1"] * 8
    probe("v2/added", 200, "only-in-v2")
    late_code, meta, data = get(LATE)
    assert (late_code, meta.get("x-boristype-probe"), data) == (200, instance, b"late-endpoint")
    observations["lateRoute"] = [before, late_code]
    observations["concurrentFirstLoads"] = {"requests": 8, "loads": 1}

    # A failed compatible update must leave A callable. Hold an actual streamed response across activation.
    install("B.dll", "broken")
    install("v1.active", "B")
    assert probe("v1/capabilities", 200, "A")["x-probe-update"] == "rejected"
    previous = instance
    restart_with_fixture()
    instance = None
    assert probe("v1/capabilities", 200, "A")["x-probe-update"] == "rejected"
    assert previous != instance
    probe("v2/capabilities", 200, "C")
    observations["coldStartWithRejectedUpdate"] = {"served": "A", "otherMajor": "C", "newInstance": True}
    with exchange(container, PREFIX + "v1/hold") as held:
        assert held.status == 200 and held.readline() == b"started:A\n"
        install("B.dll")
        assert probe("v1/capabilities", 200, "B")["x-probe-loads"] == "2"
        assert held.read() == b"A", "in-flight request switched to the new build"
    probe("v2/capabilities", 200, "C")
    observations["activation"] = {
        "badBuildWithoutPriorVersion": 409,
        "inFlight": "A",
        "next": "B",
        "otherMajor": "C",
        "sameInstance": True,
    }
    return observations


if __name__ == "__main__":
    cookie = sys.stdin.read()
    print(json.dumps(identity_sample(sys.argv[1], {**basic_header(), "Cookie": cookie})))
