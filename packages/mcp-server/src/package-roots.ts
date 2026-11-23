import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/server";

/** The stdio server negotiates initialize-based MCP revisions; ask the host on every project-path call. */
export async function packageProjectRoots(server: McpServer): Promise<string[]> {
  if (!server.server.getClientCapabilities()?.roots) return [];
  const { roots } = await server.server.listRoots(undefined, { timeout: 3000 }).catch(() => ({ roots: [] }));
  const directories = new Set<string>();
  const home = await realpath(homedir()).catch(() => homedir());
  for (const root of roots) {
    try {
      const url = new URL(root.uri);
      if (url.protocol !== "file:" || url.host || url.pathname.startsWith("//") || url.search || url.hash) continue;
      const path = resolve(fileURLToPath(url));
      if (!(await lstat(path)).isDirectory()) continue;
      const canonical = await realpath(path);
      if (canonical !== parse(canonical).root && canonical !== home) directories.add(path);
    } catch {
      // The client can be remote; a root must identify a directory on this MCP host.
    }
  }
  return [...directories];
}
