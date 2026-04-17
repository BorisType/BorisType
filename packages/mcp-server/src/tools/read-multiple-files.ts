import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/read-multiple-files.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_read_multiple_files` — параллельное чтение нескольких файлов.
 *
 * Читает содержимое нескольких файлов за один вызов. Каждый файл обрабатывается
 * независимо — ошибка чтения одного файла не прерывает чтение остальных.
 *
 * ### Платформенный подход
 *
 * Файлы читаются последовательно через `tools.load_url_text_server`,
 * т.к. evaluator не поддерживает параллельное выполнение.
 * Результаты собираются в единый ответ.
 *
 * ### Формат ответа
 *
 * Возвращает по одному text-блоку на каждый файл в формате:
 * ```
 * === <path> ===
 * <content>
 * ```
 *
 * Для файлов с ошибкой:
 * ```
 * === <path> ===
 * [ERROR] <message>
 * ```
 *
 * ### Обработка ошибок
 *
 * | Случай                         | Поведение                                                      | Формат ответа                                                         |
 * |--------------------------------|----------------------------------------------------------------|-----------------------------------------------------------------------|
 * | Все файлы прочитаны            | Возвращает содержимое всех файлов                              | `{ content: [{ text: "=== path ===\ncontent" }, ...] }`               |
 * | Часть файлов не найдена        | Прочитанные файлы возвращаются, для ненайденных — ошибка       | Смешанный ответ: успешные + `[ERROR] File not found: <path>`          |
 * | Все файлы не найдены           | Возвращает ошибки для всех файлов                              | `{ content: [...], isError: true }`                                   |
 * | Пустой массив paths            | Возвращает ошибку                                              | `{ isError: true, text: "No file paths provided" }`                   |
 * | Некорректный формат пути       | Ошибка для конкретного файла, остальные читаются               | `[ERROR] Invalid path format: <path>`                                 |
 * | Ошибка соединения              | Все последующие файлы также возвращают ошибку                  | `{ isError: true, text: "Connection error: <message>" }`              |
 *
 * ### Ограничения
 *
 * Рекомендуется не более 20 файлов за один вызов, чтобы избежать таймаута evaluator.
 */
export function registerReadMultipleFilesTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_read_multiple_files",
    {
      description:
        "Read multiple files from the WebSoft HCM server in a single request. Each file is read independently — a failure for one file does not affect others. Returns content blocks prefixed with file paths.",
      inputSchema: {
        paths: z.array(z.string()).describe("Array of server file URLs (e.g. ['x-local://wt/web/a.bs', 'x-local://wt/web/b.bs'])"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ paths }) => {
      // TODO: реализовать
      // 1. Проверить, что paths не пуст
      // 2. Для каждого path:
      //    a. Попробовать прочитать через tools.load_url_text_server
      //    b. При ошибке — запомнить ошибку, продолжить
      // 3. Сформировать массив content-блоков
      // 4. Если все файлы с ошибкой — isError: true
      throw new Error("Not implemented");
    },
  );
}
