/**
 * Команда push — CLI обёртка для загрузки dist на WSHCM сервер
 *
 * Тонкая обёртка над core/pushing/processPush().
 * Вся бизнес-логика находится в core/pushing/.
 */

import { processPush } from "../../core/pushing/index";
import type { PushCommandOptions } from "../../core/pushing/types";

/**
 * Команда push - загрузка dist на WSHCM сервер
 *
 * Выполняет:
 * 1. Отправку dist на WSHCM сервер
 * 2. Сброс кеша модулей
 * 3. Reinit для standalone и components
 *
 * Приоритет опций:
 * 1. CLI параметры
 * 2. btconfig.properties
 * 3. Дефолтные значения (localhost:80, user1:user1)
 *
 * @param cliOptions - Опции из CLI (опциональные)
 */
export async function pushCommand(cliOptions: PushCommandOptions = {}): Promise<void> {
  await processPush(process.cwd(), cliOptions);
}
