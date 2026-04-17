import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/move-file.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_move_file` — перемещение/переименование файла на WSHCM сервере.
 *
 * Перемещает или переименовывает файл из одного x-local:// пути в другой.
 * Если целевой файл уже существует — операция завершится ошибкой.
 *
 * ### Платформенный подход
 *
 * WSHCM не имеет встроенной функции `MoveFile`.
 * Реализация через цепочку: читаем содержимое → записываем в новый путь → удаляем оригинал.
 * Это НЕ атомарная операция — при ошибке на этапе удаления файл может остаться в обоих местах.
 *
 * ### Обработка ошибок
 *
 * | Случай                        | Поведение                                              | Формат ответа                                                                 |
 * |-------------------------------|--------------------------------------------------------|-------------------------------------------------------------------------------|
 * | Исходный файл не найден       | Возвращает ошибку, операция не выполняется              | `{ isError: true, text: "Source file not found: <path>" }`                    |
 * | Целевой файл уже существует   | Возвращает ошибку, операция не выполняется              | `{ isError: true, text: "Destination already exists: <path>" }`              |
 * | Ошибка записи в целевой путь  | Возвращает ошибку, исходный файл остаётся на месте      | `{ isError: true, text: "Failed to write destination: <message>" }`          |
 * | Ошибка удаления исходного     | Возвращает предупреждение, файл существует в обоих местах| `{ text: "File copied but source not deleted: <path>. Manual cleanup needed." }` |
 * | Некорректный формат пути      | Возвращает ошибку                                       | `{ isError: true, text: "Invalid path format. Expected x-local:// URL" }`    |
 * | Успех                         | Файл перемещён                                          | `{ text: "File moved: <source> → <destination>" }`                           |
 */
export function registerMoveFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_move_file",
    {
      description:
        "Move or rename a file on the WebSoft HCM server from one x-local:// URL path to another. Fails if the destination already exists.",
      inputSchema: {
        source: z.string().describe("Source file URL (e.g. x-local://wt/web/old-name.bs)"),
        destination: z.string().describe("Destination file URL (e.g. x-local://wt/web/new-name.bs)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ source, destination }) => {
      // TODO: реализовать
      // 1. Проверить существование source (попробовать прочитать)
      // 2. Проверить отсутствие destination
      // 3. Прочитать содержимое source
      // 4. Записать содержимое в destination
      // 5. Удалить source
      // 6. При ошибке на шаге 5 — вернуть предупреждение, а не ошибку
      throw new Error("Not implemented");
    },
  );
}
