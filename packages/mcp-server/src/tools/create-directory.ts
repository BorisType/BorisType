import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/create-directory.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_create_directory` — создание директории на WSHCM сервере.
 *
 * Создаёт директорию по указанному x-local:// пути. Операция идемпотентна —
 * если директория уже существует, возвращает успех без ошибки.
 *
 * ### Платформенный подход
 *
 * Используется BorisScript-функция `ObtainDirectory(path)`, которая создаёт
 * директорию и все промежуточные директории (аналог `mkdir -p`).
 *
 * ### Обработка ошибок
 *
 * | Случай                         | Поведение                                          | Формат ответа                                                            |
 * |--------------------------------|----------------------------------------------------|--------------------------------------------------------------------------|
 * | Директория создана             | Возвращает успех                                   | `{ text: "Directory created: <path>" }`                                  |
 * | Директория уже существует      | Возвращает успех (идемпотентная операция)           | `{ text: "Directory already exists: <path>" }`                           |
 * | По пути существует файл        | Возвращает ошибку                                  | `{ isError: true, text: "Path exists as a file, not a directory: <path>" }` |
 * | Некорректный формат пути       | Возвращает ошибку                                  | `{ isError: true, text: "Invalid path format. Expected x-local:// URL" }` |
 * | Ошибка на уровне платформы     | Возвращает ошибку с сообщением                     | `{ isError: true, text: "Failed to create directory: <message>" }`       |
 */
export function registerCreateDirectoryTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_create_directory",
    {
      description:
        "Create a directory on the WebSoft HCM server at the given x-local:// URL path. Idempotent — succeeds if the directory already exists. Creates intermediate directories as needed.",
      inputSchema: {
        path: z.string().describe("Server directory URL to create (e.g. x-local://wt/web/new-folder/)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ path }) => {
      // TODO: реализовать
      // 1. Проверить, не существует ли файл (не директория) по этому пути
      // 2. ObtainDirectory(path) — создаёт директорию и промежуточные
      // 3. Проверить IsDirectory(path) для подтверждения
      throw new Error("Not implemented");
    },
  );
}
