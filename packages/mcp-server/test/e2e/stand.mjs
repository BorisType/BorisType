import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

/** Run a bounded Docker command without a shell or credentials in argv. */
function docker(args, options = {}) {
  return execFileSync("docker", args, { timeout: 5_000, maxBuffer: 1024 * 1024, stdio: "pipe", ...options });
}

/** Locate the explicitly selected running local stand and allocate unique fixture names. */
export function localStand() {
  const container = process.env.WSHCM_E2E_CONTAINER;
  const username = process.env.WSHCM_E2E_USERNAME;
  const password = process.env.WSHCM_E2E_PASSWORD;
  assert.ok(container && username && password, "Set WSHCM_E2E_CONTAINER, WSHCM_E2E_USERNAME and WSHCM_E2E_PASSWORD");
  assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "Expected a Docker container name");
  const inspect = JSON.parse(
    docker([
      "inspect",
      "--format",
      '{"running":{{.State.Running}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"networks":{{json .NetworkSettings.Networks}}}',
      container,
    ]).toString("utf8"),
  );
  assert.equal(inspect.running, true, "The stand must already be running; this suite does not deploy or start it");
  const addresses = Object.values(inspect.networks)
    .map((network) => network.IPAddress)
    .filter(Boolean);
  assert.equal(addresses.length, 1, "Expected one directly reachable Docker IPv4 address (Linux Docker host)");
  const base = "/WebsoftServer/wt";
  const name = `mcp-e2e-${randomUUID()}`;
  const directory = `${base}/${name}`;
  const url = `x-local://wt/${name}/`;
  const exec = (...args) => docker(["exec", container, ...args]);
  exec("test", "-d", base);

  return {
    container,
    host: addresses[0],
    image: inspect.image,
    imageId: inspect.imageId,
    directory,
    url,
    exec,
    exists(path) {
      try {
        exec("test", "-e", path);
        return true;
      } catch (error) {
        if (error.status === 1) return false;
        throw error;
      }
    },
    seed(name, content) {
      docker(["exec", "-i", container, "tee", `${directory}/${name}`], { input: Buffer.from(content, "utf8") });
    },
    readBytes(name) {
      return exec("cat", "--", `${directory}/${name}`);
    },
    evaluators() {
      return exec("find", base, "-maxdepth", "1", "-type", "f", "-name", "unsafe_eval_*.bs", "-printf", "%f\n")
        .toString("utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort();
    },
    removeEvaluator(name) {
      assert.match(name, /^unsafe_eval_[a-zA-Z0-9]{32}\.bs$/);
      exec("rm", "--", `${base}/${name}`);
    },
    createClient() {
      const client = new Client({ name: "boristype-hcm-e2e", version: "1.0.0" }, { supportedProtocolVersions: ["2025-11-25"] });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("../../build/cli.js", import.meta.url))],
        env: {
          NODE_USE_ENV_PROXY: "0",
          WSHCM_HOST: addresses[0],
          WSHCM_PORT: "80",
          WSHCM_USERNAME: username,
          WSHCM_PASSWORD: password,
          WSHCM_HTTPS: "false",
        },
        stderr: "pipe",
      });
      // Drain stderr, but do not copy arbitrary server diagnostics or credentials into test output.
      transport.stderr.resume();
      return { client, transport };
    },
  };
}
