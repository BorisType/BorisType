import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/search-files.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_search_files` — рекурсивный поиск файлов на WSHCM сервере.
 *
 * Ищет файлы по glob-паттерну внутри указанной директории (рекурсивно).
 * Возвращает список путей, соответствующих паттерну.
 *
 * ### Платформенный подход
 *
 * WSHCM не имеет встроенного glob-поиска. Реализация через рекурсивный обход
 * директорий с помощью `ReadDirectory` и ручное сопоставление имён файлов с паттерном.
 *
 * Поддерживаемые паттерны:
 * - `*` — любая последовательность символов (кроме `/`)
 * - `**` — рекурсивный спуск по директориям
 * - `?` — один любой символ
 *
 * ### Формат ответа
 *
 * Возвращает JSON-массив строк — абсолютных x-local:// путей к найденным файлам.
 * ```json
 * ["x-local://wt/web/app.bs", "x-local://wt/web/lib/utils.bs"]
 * ```
 *
 * ### Обработка ошибок
 *
 * | Случай                         | Поведение                                          | Формат ответа                                                            |
 * |--------------------------------|----------------------------------------------------|--------------------------------------------------------------------------|
 * | Директория не найдена          | Возвращает ошибку                                  | `{ isError: true, text: "Directory not found: <path>" }`                 |
 * | Путь не является директорией   | Возвращает ошибку                                  | `{ isError: true, text: "Path is not a directory: <path>" }`             |
 * | Нет совпадений                 | Возвращает пустой массив                            | `{ text: "[]" }`                                                        |
 * | Ошибка доступа к поддиректории | Пропускает недоступную директорию, продолжает поиск | В результат добавляется пометка о пропущенных директориях                |
 * | Слишком глубокая рекурсия      | Ограничение: maxDepth (по умолчанию 10)            | Поиск прекращается на указанной глубине                                  |
 * | Некорректный формат пути       | Возвращает ошибку                                  | `{ isError: true, text: "Invalid path format. Expected x-local:// URL" }` |
 * | Успех                          | Возвращает JSON-массив найденных путей              | `{ text: "[\"x-local://...\", ...]" }`                                  |
 *
 * ### Ограничения
 *
 * - Максимальная глубина рекурсии по умолчанию: 10 уровней
 * - Результаты ограничены 1000 файлами для предотвращения переполнения
 * - Поиск по содержимому файлов не поддерживается (только по именам)
 */
export function registerSearchFilesTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_search_files",
    {
      description:
        "Recursively search for files matching a glob pattern within a directory on the WebSoft HCM server. Returns an array of matching x-local:// paths. Supports * (any chars), ** (recursive), ? (single char) patterns.",
      inputSchema: {
        path: z.string().describe("Root directory URL to search in (e.g. x-local://wt/web/)"),
        pattern: z.string().describe("Glob pattern to match file names (e.g. '*.bs', '**/*.xml', 'config?.json')"),
        excludePatterns: z
          .array(z.string())
          .optional()
          .describe("Glob patterns to exclude from results (e.g. ['node_modules/**', '*.tmp'])"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path, pattern, excludePatterns }) => {
      // TODO: реализовать
      // 1. Проверить, что path — директория
      // 2. Конвертировать glob-паттерн в функцию-матчер
      // 3. Рекурсивно обходить директории через ReadDirectory
      // 4. Для каждого файла — проверять совпадение с паттерном
      // 5. Применять excludePatterns
      // 6. Ограничить глубину (maxDepth: 10) и количество результатов (1000)
      // 7. Вернуть JSON-массив путей
      throw new Error("Not implemented");
    },
  );
}
