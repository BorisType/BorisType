import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { WshcmPackageError } from "./contracts.js";

type Access = "Import" | "Export";
type Location = { root: string; path: string };
export interface PackagePathOptions {
  /** Absolute shared directory for incoming ZIPs. */
  importDirectory?: string;
  /** Absolute shared directory for exported ZIPs. Also readable for inspection. */
  exportDirectory?: string;
  /** Explicit project root for package paths. Takes precedence over client roots. */
  projectDirectory?: string;
  /** Resolve current local workspace roots from the trusted host when a project path is used. */
  projectRoots?: () => Promise<readonly string[]>;
}

function denied(access: Access, message: string) {
  return new WshcmPackageError({ code: access + "PathDenied", phase: "input", status: "not_attempted", message });
}
function inside(root: string, path: string) {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith(".." + sep) && !isAbsolute(child);
}

export async function checkedParent({ root, path }: Location, access: Access) {
  if (!inside(root, path) || !(await lstat(root)).isDirectory()) throw denied(access, "Expected a directory inside an allowed root");
  const canonical = await realpath(root);
  let parent = canonical;
  for (const segment of relative(root, path).split(sep).slice(0, -1)) {
    parent = join(parent, segment);
    if (!(await lstat(parent)).isDirectory()) throw denied(access, "Package path contains a linked or non-directory component");
  }
  if (relative(parent, await realpath(parent)) !== "") throw denied(access, "Package directory changed");
  return { parent, canonical };
}

function absoluteDirectory(path: string, label: string) {
  if (!isAbsolute(path)) throw new Error(`Package ${label} directory must be absolute`);
  return resolve(path);
}

export class PackagePaths {
  private readonly imports: string;
  private readonly exports: string;
  private readonly project?: string;
  private readonly projectRoots?: PackagePathOptions["projectRoots"];

  constructor(options: PackagePathOptions) {
    this.projectRoots = options.projectRoots;
    const base = join(homedir(), ".boristype", "packages");
    this.imports = absoluteDirectory(options.importDirectory ?? join(base, "import"), "import");
    this.exports = absoluteDirectory(options.exportDirectory ?? join(base, "export"), "export");
    if (options.projectDirectory !== undefined) this.project = absoluteDirectory(options.projectDirectory, "project");
  }

  async locate(input: string, access: Access): Promise<Location> {
    const segments = process.platform === "win32" ? input.replace(/^[A-Za-z]:[\\/]/, "").split(/[\\/]/) : input.split("/");
    if (input.length > 4096 || !/\.zip$/i.test(input) || input.includes("\0") || segments.includes(".."))
      throw denied(access, "Expected a .zip file below an allowed directory");
    if (
      process.platform === "win32" &&
      segments.some((s) => (/[:<>|"?*]|[. ]$/.test(s) && s !== ".") || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s))
    )
      throw denied(access, "Unsupported Windows package path");
    const shared = access === "Export" ? [this.exports] : [this.imports, this.exports];
    if (isAbsolute(input)) {
      const root = shared.find((base) => inside(base, input));
      if (root) return { root, path: resolve(input) };
    }
    const projects = this.project ? [this.project] : ((await this.projectRoots?.()) ?? []).filter(isAbsolute);
    if (!isAbsolute(input) && projects.length !== 1)
      throw denied(
        access,
        "Relative paths require one project directory. Configure --project-directory or use an absolute path in an allowed directory.",
      );
    const path = isAbsolute(input) ? resolve(input) : resolve(projects[0]!, input);
    const root = projects.find((base) => inside(base, path));
    if (path.length > 4096) throw denied(access, "Resolved package path exceeds 4096 characters");
    if (!root) throw denied(access, "Use a ZIP in the configured shared directory or a project directory.");
    return { root, path };
  }

  async destination(input: string | undefined, operationId: string) {
    const location = await this.locate(input ?? join(this.exports, operationId + ".zip"), "Export");
    try {
      if (location.root === this.exports) await mkdir(this.exports, { recursive: true, mode: 0o700 });
      const { parent } = await checkedParent(location, "Export");
      if (await lstat(join(parent, basename(location.path))).catch(ignoreMissing)) throw new Error("Export destination already exists");
    } catch (cause) {
      throw denied("Export", cause instanceof Error ? cause.message : "Cannot open export directory");
    }
    return location;
  }
}

function ignoreMissing(error: NodeJS.ErrnoException): undefined {
  if (error.code !== "ENOENT") throw error;
  return undefined;
}

/** Publish only finished bytes, with exclusive creation even if two exports race. */
export async function publishPackage(source: string, location: Location) {
  const { parent } = await checkedParent(location, "Export");
  // On Linux anchor both names to the checked directory descriptor across the copy.
  const directory = process.platform === "linux" ? await open(parent, constants.O_DIRECTORY | constants.O_NOFOLLOW) : undefined;
  const anchor = directory ? `/proc/self/fd/${directory.fd}` : parent;
  const temp = join(anchor, ".boristype-" + randomUUID() + ".tmp");
  let staged = false;
  try {
    if (relative(parent, await realpath(anchor)) !== "") throw new Error("Export directory changed");
    await copyFile(source, temp, constants.COPYFILE_EXCL);
    staged = true;
    if (relative(parent, await realpath(anchor)) !== "" || (await checkedParent(location, "Export")).parent !== parent)
      throw new Error("Export directory changed");
    await link(temp, join(anchor, basename(location.path)));
  } finally {
    try {
      if (staged) await unlink(temp);
    } finally {
      await directory?.close();
    }
  }
}
