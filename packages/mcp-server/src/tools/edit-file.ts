import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/edit-file.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_edit_file` — точечное редактирование файла на WSHCM сервере.
 *
 * Применяет список патчей (oldText → newText) к содержимому файла.
 * Поддерживает dry-run режим для предварительного просмотра изменений.
 *
 * ### Платформенный подход
 *
 * Реализация: читаем файл → применяем патчи последовательно → записываем обратно.
 * Замены применяются в порядке массива `edits`. Каждый патч заменяет **первое** вхождение.
 * Если `dryRun: true` — возвращает результат без записи на сервер.
 *
 * ### Обработка ошибок
 *
 * | Случай                          | Поведение                                                    | Формат ответа                                                                      |
 * |---------------------------------|--------------------------------------------------------------|-------------------------------------------------------------------------------------|
 * | Файл не найден                  | Возвращает ошибку, ни один патч не применяется                | `{ isError: true, text: "File not found: <path>" }`                                |
 * | oldText не найден в файле       | Возвращает ошибку с номером патча, файл не изменяется         | `{ isError: true, text: "Edit #<n>: oldText not found in file" }`                  |
 * | oldText встречается >1 раз      | Возвращает ошибку с номером патча, файл не изменяется         | `{ isError: true, text: "Edit #<n>: oldText is ambiguous (found <count> matches)" }` |
 * | Ошибка записи                   | Возвращает ошибку                                             | `{ isError: true, text: "Failed to write file: <message>" }`                       |
 * | dryRun: true                    | Файл не записывается, возвращается предварительный результат   | `{ text: "<new content after edits>" }`                                            |
 * | Пустой массив edits             | Возвращает текущее содержимое файла без изменений              | `{ text: "<current content>" }`                                                    |
 * | Некорректный формат пути        | Возвращает ошибку                                             | `{ isError: true, text: "Invalid path format. Expected x-local:// URL" }`          |
 * | Успех                           | Все патчи применены, файл записан                              | `{ text: "File edited: <path> (<n> edits applied)" }`                              |
 *
 * ### Порядок валидации
 *
 * 1. Валидация пути
 * 2. Чтение файла
 * 3. Применение всех патчей последовательно (с проверкой каждого)
 * 4. Если не dryRun — запись файла
 */
export function registerEditFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_edit_file",
    {
      description:
        "Apply targeted edits to a file on the WebSoft HCM server. Each edit replaces the first occurrence of oldText with newText. Supports dry-run mode to preview changes without writing.",
      inputSchema: {
        path: z.string().describe("Server file URL (e.g. x-local://wt/web/app.bs)"),
        edits: z
          .array(
            z.object({
              oldText: z.string().describe("Exact text to find (must occur exactly once)"),
              newText: z.string().describe("Replacement text"),
            }),
          )
          .describe("List of edits to apply in order"),
        dryRun: z.boolean().optional().default(false).describe("If true, return the result without writing to the file"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ path, edits, dryRun }) => {
      // TODO: реализовать
      // 1. Прочитать файл через tools.load_url_text_server
      // 2. Для каждого edit:
      //    a. Проверить, что oldText встречается ровно 1 раз (split().length - 1 === 1)
      //    b. Заменить первое вхождение
      // 3. Если dryRun — вернуть новое содержимое
      // 4. Иначе записать через tools.put_url_text_server
      throw new Error("Not implemented");
    },
  );
}
