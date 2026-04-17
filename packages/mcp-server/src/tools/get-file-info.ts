import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/get-file-info.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_get_file_info` — получение метаданных файла на WSHCM сервере.
 *
 * Возвращает информацию о файле или директории: размер, тип, дату модификации и т.д.
 *
 * ### Платформенный подход
 *
 * Метаданные собираются через BS-функции:
 * - `IsDirectory(path)` — является ли директорией
 * - `FileSize(path)` — размер файла в байтах (0 для директорий)
 * - `FileModDate(path)` — дата последнего изменения
 * - `FileName(path)` — имя файла/директории
 * - `FileExtension(path)` — расширение файла
 *
 * ### Формат ответа
 *
 * JSON-объект с метаданными:
 * ```json
 * {
 *   "name": "app.bs",
 *   "path": "x-local://wt/web/app.bs",
 *   "isDirectory": false,
 *   "size": 1234,
 *   "extension": ".bs",
 *   "modifiedDate": "2025-01-15T10:30:00"
 * }
 * ```
 *
 * ### Обработка ошибок
 *
 * | Случай                         | Поведение                              | Формат ответа                                                            |
 * |--------------------------------|----------------------------------------|--------------------------------------------------------------------------|
 * | Файл/директория не найдена     | Возвращает ошибку                      | `{ isError: true, text: "Path not found: <path>" }`                      |
 * | Некорректный формат пути       | Возвращает ошибку                      | `{ isError: true, text: "Invalid path format. Expected x-local:// URL" }` |
 * | Неполные метаданные            | Возвращает доступные поля, null для остальных | JSON с `null` для недоступных полей                                 |
 * | Успех                          | Возвращает JSON с метаданными           | `{ text: "{...}" }`                                                     |
 */
export function registerGetFileInfoTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_get_file_info",
    {
      description:
        "Get metadata about a file or directory on the WebSoft HCM server. Returns name, path, size, type, extension, and modification date.",
      inputSchema: {
        path: z.string().describe("Server file or directory URL (e.g. x-local://wt/web/app.bs)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path }) => {
      // TODO: реализовать
      // BS-скрипт для сбора метаданных:
      // var _info = {};
      // _info.name = FileName(path);
      // _info.path = path;
      // _info.isDirectory = IsDirectory(path);
      // _info.size = FileSize(path);
      // _info.extension = FileExtension(path);
      // _info.modifiedDate = FileModDate(path);
      // return EncodeJson(_info);
      throw new Error("Not implemented");
    },
  );
}
