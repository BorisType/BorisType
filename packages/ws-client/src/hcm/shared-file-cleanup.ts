import { randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, opendir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import { z } from "zod";
import { inside, withParent } from "./local-file-access.js";

export const sharedLifetimeMs = 24 * 60 * 60 * 1000;
const recordSchema = z.strictObject({ name: z.string().min(1).max(4096), dev: z.string(), ino: z.string(), birth: z.string() });
const markerName = /^(\d{13})-[a-f0-9-]{36}\.json(?:\.(\d{13})-[a-f0-9-]{36})?$/;

export function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function recordOwnership(root: string, path: string, stat: BigIntStats, expires: number) {
  const directory = join(root, ".leases");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) throw new Error("Invalid shared file registry");
  const marker = join(directory, expires + "-" + randomUUID() + ".json");
  const record = { name: relative(root, path), dev: String(stat.dev), ino: String(stat.ino), birth: String(stat.birthtimeNs) };
  await writeFile(marker, JSON.stringify(record), { mode: 0o600, flag: "wx" });
  return marker;
}

/** Claim before unlinking so independent MCP processes cannot reap the same publication twice. */
async function reap(root: string, directory: string, name: string, now: number) {
  const match = markerName.exec(name);
  if (!match || Number(match[1]) > now || (match[2] && Number(match[2]) + 300_000 > now)) return;
  const claimed = join(directory, name.slice(0, name.indexOf(".json") + 5) + "." + now + "-" + randomUUID());
  await rename(join(directory, name), claimed);
  const marker = await open(claimed, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await marker.stat();
    if (!stat.isFile() || stat.size > 32_768) throw new Error("Invalid shared file record");
    const entry = recordSchema.parse(JSON.parse(await marker.readFile("utf8")));
    const target = join(root, entry.name);
    const group = entry.name.split(sep)[0];
    const extension = group === "packages" ? ".zip" : group === "objects" ? ".xml" : undefined;
    if (
      !extension ||
      !entry.name.toLowerCase().endsWith(extension) ||
      !inside(join(root, group), target) ||
      relative(root, target) !== entry.name
    )
      throw new Error("Invalid shared file location");
    try {
      await withParent({ root, path: target }, async (anchor) => {
        const path = join(anchor, basename(target));
        const item = await lstat(path, { bigint: true });
        if (
          item.isFile() &&
          item.ino !== 0n &&
          item.birthtimeNs > 0n &&
          String(item.dev) === entry.dev &&
          String(item.ino) === entry.ino &&
          String(item.birthtimeNs) === entry.birth
        )
          await unlink(path);
      });
    } catch (error) {
      if (!missing(error)) throw error;
    }
  } finally {
    await marker.close();
  }
  await unlink(claimed);
}

/** Remove expired publications belonging to this shared root. The stdio server schedules this independently of HCM. */
export async function cleanExpiredSharedFiles(root = join(homedir(), ".boristype", "shared"), now = Date.now()) {
  const directory = join(root, ".leases");
  try {
    if (!(await lstat(root)).isDirectory() || !(await lstat(directory)).isDirectory()) return;
    const entries = await opendir(directory);
    let failure: unknown;
    for await (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        await reap(root, directory, entry.name, now);
      } catch (error) {
        if (!missing(error)) failure = error;
      }
    }
    if (failure) throw failure;
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
