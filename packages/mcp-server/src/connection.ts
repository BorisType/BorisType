import { WshcmClient, Evaluator } from "@boristype/ws-client";
import type { McpServerOptions } from "./types.js";
import { defaultConnectionTimeoutMs, toWshcmClientOptions } from "./types.js";

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
  const request = { timeoutMs: options.connectionTimeoutMs ?? defaultConnectionTimeoutMs };
  await client.initialize(request);

  const evaluator = client.createEvaluator();
  try {
    await evaluator.initialize(request);
  } catch (cause) {
    if (!(await evaluator.close(request))) {
      throw new AggregateError([cause], "Evaluator setup failed and temporary WSHCM evaluator cleanup was not confirmed", { cause });
    }
    throw cause;
  }

  return { client, evaluator };
}

/**
 * Закрывает соединение, удаляя evaluator с сервера.
 * @throws {Error} если удаление временной библиотеки не подтверждено
 */
export async function closeConnection(connection: WshcmConnection): Promise<void> {
  if (!(await connection.evaluator.close())) {
    throw new Error("Temporary WSHCM evaluator cleanup was not confirmed");
  }
}
