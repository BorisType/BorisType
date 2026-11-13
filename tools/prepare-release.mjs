import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export async function prepareRelease(root, channel) {
  if (!["alpha", "stable"].includes(channel)) throw new Error("Release channel must be alpha or stable");
  let pre;
  try {
    pre = JSON.parse(await readFile(join(root, ".changeset/pre.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const run = async (command, ...args) => {
    const result = await exec(command, args, { cwd: root, maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  };
  const changeset = (...args) => run(process.execPath, fileURLToPath(import.meta.resolve("@changesets/cli/bin.js")), ...args);
  if (channel === "alpha" && (!pre || pre.mode === "exit")) await changeset("pre", "enter", "alpha");
  else if (channel === "alpha" && pre.tag !== "alpha") throw new Error("Another prerelease channel is active");
  else if (channel === "stable" && pre?.mode === "pre") await changeset("pre", "exit");
  await changeset("version");
  await run(pnpm, "install", "--lockfile-only", "--ignore-scripts");
  await run(pnpm, "install", "--frozen-lockfile", "--ignore-scripts");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  prepareRelease(root, process.argv[2]).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
