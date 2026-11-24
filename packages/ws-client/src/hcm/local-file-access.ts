import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";

export type TransferKind = "packages" | "objects";
export type Access = "Import" | "Export";

export class LocalFileError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function denied(access: Access, message: string) {
  return new LocalFileError(access + "PathDenied", message);
}

export function inside(root: string, path: string) {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith(".." + sep) && !isAbsolute(child);
}

export async function checkedParent({ root, path }: { root: string; path: string }, access: Access) {
  if (!inside(root, path) || !(await lstat(root)).isDirectory()) throw denied(access, "Expected a directory inside an allowed root");
  const canonical = await realpath(root);
  let parent = canonical;
  for (const segment of relative(root, path).split(sep).slice(0, -1)) {
    parent = join(parent, segment);
    if (!(await lstat(parent)).isDirectory()) throw denied(access, "File path contains a linked or non-directory component");
  }
  if (relative(parent, await realpath(parent)) !== "") throw denied(access, "File directory changed");
  return { parent, canonical };
}

/** External tool inputs must be scoped to an admitted root. Downloads and verified handles have trusted sources. */
export async function openTransferSource(localPath: string, kind: TransferKind, sourceDirectory?: string) {
  if (!isAbsolute(localPath)) throw new Error("File path must be absolute");
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  if (sourceDirectory === undefined) {
    if (!(await lstat(localPath)).isFile()) throw new Error("Package source must be a regular file");
    return open(localPath, flags);
  }

  function denied() {
    return new LocalFileError("ImportPathDenied", "Expected a regular file inside the allowed directory");
  }
  function reportSourceError(cause: unknown): never {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      throw new LocalFileError(
        kind === "packages" ? "PackageFileNotFound" : "ObjectFileNotFound",
        (kind === "packages" ? "Package" : "Object XML") + " file not found at " + localPath,
        { cause },
      );
    throw cause;
  }
  if (process.platform === "win32" && relative(sourceDirectory, localPath).includes(":")) throw denied();
  const { parent, canonical: root } = await checkedParent({ root: sourceDirectory, path: localPath }, "Import").catch(reportSourceError);
  const path = join(parent, basename(localPath));
  const expected = await lstat(path, { bigint: true }).catch(reportSourceError);
  if (!expected.isFile() || expected.nlink !== 1n) throw denied();
  const source = await open(path, flags).catch(reportSourceError);
  try {
    // Bind admission to the open file before reading any bytes. On Linux ask the kernel for its path.
    const actual = await source.stat({ bigint: true });
    if (!actual.isFile() || actual.nlink !== 1n || actual.dev !== expected.dev || actual.ino !== expected.ino) throw denied();
    const openedPath = await realpath(process.platform === "linux" ? `/proc/self/fd/${source.fd}` : path);
    if (!openedPath.startsWith(root.endsWith(sep) ? root : root + sep)) throw denied();
    const verified = await lstat(openedPath, { bigint: true });
    if (verified.dev !== actual.dev || verified.ino !== actual.ino) throw denied();
    return source;
  } catch (error) {
    await source.close();
    throw error;
  }
}

export async function withParent<T>(
  location: { root: string; path: string },
  action: (anchor: string, verify: () => Promise<void>) => Promise<T>,
) {
  const { parent } = await checkedParent(location, "Export");
  const directory = process.platform === "linux" ? await open(parent, constants.O_DIRECTORY | constants.O_NOFOLLOW) : undefined;
  const anchor = directory ? "/proc/self/fd/" + directory.fd : parent;
  const verify = async () => {
    if (relative(parent, await realpath(anchor)) !== "" || (await checkedParent(location, "Export")).parent !== parent)
      throw denied("Export", "Destination directory changed");
  };
  try {
    await verify();
    return await action(anchor, verify);
  } finally {
    await directory?.close();
  }
}
