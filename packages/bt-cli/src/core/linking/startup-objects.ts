import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BtConfigLinkingPackage } from "../config.js";
import { startupObjectApiName, startupObjectInitUrl, startupObjectIdentity, startupObjectLibrary } from "../startup-object-library.js";
import { xmlBuilder } from "../utils/xml.js";
import { buildApiExt } from "./generators/api-ext.js";
import type { LinkingContext } from "./types.js";

const outputPath = "wt/bt-startup-objects";
const baseUrl = "x-local://" + outputPath;
const clearedMarker = "<!-- btc: removed startup objects -->";

function readIfPresent(filename: string): string {
  return fs.statSync(filename, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(filename, "utf8") : "";
}

/** An empty string records a retired release for subsequent clean overlay builds. */
export function previousStartupRelease(dist: string): string | undefined {
  const init = readIfPresent(path.join(dist, outputPath, "init.xml"));
  const active = init.match(/<!-- btc: startup objects ([0-9a-f]{64}) -->\s*$/)?.[1];
  if (active) return active;
  if (readIfPresent(path.join(dist, "source/api_ext.xml")).trimEnd().endsWith(clearedMarker)) return "";
  return undefined;
}

function objectTypes(project: string): fs.Dirent<string>[] | undefined {
  const objects = path.join(project, "objects");
  if (fs.statSync(objects, { throwIfNoEntry: false })?.isDirectory()) return fs.readdirSync(objects, { withFileTypes: true });
  return undefined;
}

function explicitlyEmpty(types: fs.Dirent<string>[] | undefined): boolean {
  return types?.every((entry) => entry.isFile() && entry.name === ".gitkeep") === true;
}

export function isObjectsOnlyProject(project: string): boolean {
  const types = objectTypes(project);
  return (
    explicitlyEmpty(types) ||
    !!types?.some((type) => type.isDirectory()) ||
    previousStartupRelease(path.join(project, "dist")) !== undefined
  );
}

function collectObjects(ctx: LinkingContext) {
  const roots = new Set([ctx.projectPath]);
  for (const { info } of ctx.linkedPackages) {
    if (!info.dependencyNode && (info.packageType === "standalone" || info.packageType === "component")) {
      roots.add(info.projectPath);
    }
  }

  const files = new Map<string, string>();
  const ids = new Map<string, string>();
  for (const root of roots) {
    for (const type of objectTypes(root) ?? []) {
      if (!type.isDirectory()) continue;
      const typePath = path.join(root, "objects", type.name);
      for (const file of fs.readdirSync(typePath, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".xml")) continue;
        const filename = path.join(typePath, file.name);
        const { objectType, id } = startupObjectIdentity(filename);
        if (ids.has(id)) throw new Error(`Duplicate startup object ID ${id}: ${ids.get(id)} and ${filename}`);
        ids.set(id, filename);
        files.set(objectType + "/" + file.name, filename);
      }
    }
  }
  return files;
}

function inside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel);
}

function sourceForOutput(source: string, target: string, file: string): string | undefined {
  if (!inside(target, file)) return undefined;
  const candidate = path.join(source, path.relative(target, file));
  return fs.existsSync(candidate) ? candidate : undefined;
}

export function checkStartupTarget(dist: string, source: string, target: string): void {
  const reserved = path.join(dist, outputPath);
  if (inside(reserved, target) || sourceForOutput(source, target, reserved)) {
    throw new Error("Startup objects output collision: " + target + " overlaps " + reserved);
  }
}

function suppliedRegistry(ctx: LinkingContext, packages: BtConfigLinkingPackage[], protectOutput: boolean) {
  const outputs = ctx.linkedPackages.map(({ info, outputPath: target }) => ({ source: info.sourceDir, target }));
  for (const pkg of packages) {
    if (pkg.source && pkg.target) {
      outputs.push({ source: path.join(ctx.projectPath, pkg.source), target: path.join(ctx.distPath, pkg.target) });
    }
  }
  let registry: string | undefined;
  for (const { source, target } of outputs) {
    if (protectOutput) checkStartupTarget(ctx.distPath, source, target);
    const file = sourceForOutput(source, target, path.join(ctx.distPath, "source/api_ext.xml"));
    if (file) registry = fs.readFileSync(file, "utf8");
  }
  return registry;
}

/** Returns the deployment registry when installing or retiring an object release. */
export function linkStartupObjects(
  ctx: LinkingContext,
  packages: BtConfigLinkingPackage[],
  previous: string | undefined,
): string | undefined {
  const files = collectObjects(ctx);
  if (files.size === 0 && previous === undefined && !explicitlyEmpty(objectTypes(ctx.projectPath))) return undefined;

  const reserved = path.join(ctx.distPath, outputPath);
  const template = suppliedRegistry(ctx, packages, files.size > 0 || !!previous);
  if (files.size === 0) {
    if (previous && previousStartupRelease(ctx.distPath) === previous) {
      fs.rmSync(path.join(reserved, previous), { recursive: true, force: true });
      fs.rmSync(path.join(reserved, "init.xml"));
      if (!fs.readdirSync(reserved).length) fs.rmdirSync(reserved);
    }
    // An overlay upload needs a replacement registry even when this was its only entry.
    if (template && !ctx.apiExtEntries.length) return undefined; // The project supplied a complete replacement.
    const registry = buildApiExt(ctx.apiExtEntries, template);
    return ctx.apiExtEntries.length || template ? registry : registry + "\n" + clearedMarker + "\n";
  }

  if (fs.existsSync(reserved) && !previousStartupRelease(ctx.distPath)) {
    throw new Error("Startup objects output already exists: " + reserved);
  }
  const registry = buildApiExt(ctx.apiExtEntries, template, { name: startupObjectApiName, libs: [startupObjectInitUrl] });
  const loader = startupObjectLibrary();
  // Build outside the published directory. A reader or a retry sees a complete release.
  const staging = fs.mkdtempSync(path.join(ctx.distPath, ".btc-startup-"));
  try {
    const tree = path.join(staging, "release");
    const hash = createHash("sha256").update(loader);
    for (const name of [...files.keys()].sort()) {
      const data = fs.readFileSync(files.get(name)!);
      hash.update("\0" + name + "\0").update(createHash("sha256").update(data).digest());
      const dest = path.join(tree, "objects", name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }
    fs.writeFileSync(path.join(tree, "loader.js"), loader);
    const release = hash.digest("hex");
    fs.renameSync(tree, path.join(staging, release));
    const url = baseUrl + "/" + release;
    const init = xmlBuilder.build({
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      "SPXML-INLINE-FORM": {
        OnInit: {
          "@_PROPERTY": "1",
          "@_EXPR": `if (LdsIsServer) { OpenCodeLib('${url}/loader.js').BtLoadStartupObjects(['${url}/objects']); }`,
        },
      },
    });
    fs.writeFileSync(path.join(staging, "init.xml"), init + `\n<!-- btc: startup objects ${release} -->\n`);
    if (!fs.existsSync(reserved)) {
      fs.mkdirSync(path.dirname(reserved), { recursive: true });
      fs.renameSync(staging, reserved);
    } else {
      const dest = path.join(reserved, release);
      if (!fs.existsSync(dest)) fs.renameSync(path.join(staging, release), dest);
      fs.renameSync(path.join(staging, "init.xml"), path.join(reserved, "init.xml"));
      if (previous && previous !== release) fs.rmSync(path.join(reserved, previous), { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return registry;
}
