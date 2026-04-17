import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/directory-tree.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_directory_tree` — вывод дерева директории на WSHCM сервере.
 *
 * Строит дерево файлов и поддиректорий в текстовом формате.
 *
 * ### Платформенный подход
 *
 * Рекурсивный обход через `ReadDirectory` + `IsDirectory` + `FileName`.
 * Дерево формируется на стороне сервера (BS-скрипт), чтобы минимизировать
 * количество обращений по сети.
 *
 * ### Формат ответа
 *
 * Текстовое дерево в формате, аналогичном команде `tree`:
 * ```
 * x-local://wt/web/
 * ├── app.bs
 * ├── lib/
 * │   ├── utils.bs
 * │   └── math.bs
 * └── config.json
 * ```
 *
 * ### Обработка ошибок
 *
 * | Случай                         | Поведение                                                | Формат ответа                                                            |
 * |--------------------------------|----------------------------------------------------------|--------------------------------------------------------------------------|
 * | Директория не найдена          | Возвращает ошибку                                        | `{ isError: true, text: "Directory not found: <path>" }`                 |
 * | Путь не является директорией   | Возвращает ошибку                                        | `{ isError: true, text: "Path is not a directory: <path>" }`             |
 * | Пустая директория              | Возвращает только корневой путь                          | `{ text: "<path>\n(empty)" }`                                            |
 * | Ошибка доступа к поддиректории | Поддиректория помечается как недоступная, обход продолжается | `├── restricted-dir/ [access denied]`                                  |
 * | Слишком глубокое дерево        | Обрезается на maxDepth, помечается `[...]`                | `│   └── deep-dir/ [...]`                                                |
 * | Некорректный формат пути       | Возвращает ошибку                                        | `{ isError: true, text: "Invalid path format. Expected x-local:// URL" }` |
 * | Успех                          | Текстовое дерево                                          | `{ text: "<tree output>" }`                                             |
 *
 * ### Ограничения
 *
 * - Максимальная глубина по умолчанию: 5 уровней
 * - Максимальное количество элементов: 500
 */
export function registerDirectoryTreeTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_directory_tree",
    {
      description:
        "Display a tree view of files and directories on the WebSoft HCM server starting from the given x-local:// path. Returns a text tree structure similar to the `tree` command.",
      inputSchema: {
        path: z.string().describe("Root directory URL (e.g. x-local://wt/web/)"),
        maxDepth: z.number().int().min(1).max(10).optional().default(5).describe("Maximum depth of the tree (default: 5, max: 10)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path, maxDepth }) => {
      // TODO: реализовать
      // 1. Проверить, что path — директория
      // 2. Рекурсивный обход через ReadDirectory / IsDirectory / FileName
      // 3. Формировать текстовое дерево с символами ├── │ └──
      // 4. Ограничить глубину (maxDepth) и количество элементов (500)
      // 5. Помечать обрезанные ветки как [...]
      throw new Error("Not implemented");
    },
  );
}
