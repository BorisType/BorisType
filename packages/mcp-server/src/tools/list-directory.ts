import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";

/**
 * BS-скрипт для листинга директории.
 *
 * Использует платформенную функцию `ReadDirectory` для получения списка файлов/папок.
 * Возвращает JSON-массив объектов `{ name, isDirectory }`.
 */
function buildListDirectoryScript(path: string): string {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `
var _items = ReadDirectory('${escapedPath}');
var _result = [];
var _i;
for (_i in _items) {
  var _entry = {};
  _entry.name = FileName(_i);
  _entry.isDirectory = IsDirectory(_i);
  _result.push(_entry);
}
return EncodeJson(_result);
`.trim();
}

/**
 * Регистрирует tool `wshcm_list_directory` — листинг директории на WSHCM сервере.
 *
 * Возвращает список файлов и папок по указанному серверному URL (x-local://).
 */
export function registerListDirectoryTool(server: McpServer, connection: WshcmConnection): void {
  server.tool(
    "wshcm_list_directory",
    "List files and directories at the given x-local:// URL path on the WebSoft HCM server",
    { path: z.string().describe("Server directory URL (e.g. x-local://wt/web/)") },
    { readOnlyHint: true, destructiveHint: false },
    async ({ path }) => {
      const script = buildListDirectoryScript(path);
      const result = await connection.evaluator.eval(script);
      return { content: [{ type: "text" as const, text: String(result ?? "[]") }] };
    },
  );
}
