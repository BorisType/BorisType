import { WshcmClient, Evaluator } from "@boristype/ws-client";
import type { McpServerOptions } from "./types.js";
import { toWshcmClientOptions } from "./types.js";

/**
 * Активное соединение с WSHCM сервером.
 * Управляет lifecycle клиента и evaluator.
 */
export interface WshcmConnection {
  client: WshcmClient;
  evaluator: Evaluator;
}

/**
 * Создаёт и инициализирует соединение с WSHCM сервером.
 *
 * @param options - параметры подключения
 * @returns инициализированное соединение
 * @throws {UnauthorizedError} если авторизация не удалась
 */
export async function createConnection(options: McpServerOptions): Promise<WshcmConnection> {
  const client = new WshcmClient(toWshcmClientOptions(options));
  await client.initialize();

  const evaluator = client.createEvaluator();
  await evaluator.initialize();

  return { client, evaluator };
}

/**
 * Закрывает соединение, удаляя evaluator с сервера.
 */
export async function closeConnection(connection: WshcmConnection): Promise<void> {
  await connection.evaluator.close();
}
