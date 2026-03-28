/**
 * Конфигурация подключения для push
 *
 * Парсинг btconfig.properties и мерж опций с приоритетом:
 * CLI > btconfig.properties > defaults
 *
 * @module core/pushing/config
 */

import * as path from "node:path";
import { parsePropertiesFile } from "../utils/properties";
import type { PushConnectionOptions, PartialPushConnectionOptions } from "./types";

/**
 * Дефолтные значения для подключения к WSHCM серверу
 */
const DEFAULTS: PushConnectionOptions = {
  https: false,
  host: "localhost",
  port: 80,
  username: "user1",
  password: "user1",
};

/**
 * Парсит файл btconfig.properties
 *
 * @param cwd - директория проекта
 * @returns частичные опции подключения
 */
export function parseBtConfigProperties(cwd: string): PartialPushConnectionOptions {
  const result = parsePropertiesFile(path.join(cwd, "btconfig.properties"));

  return {
    https: result["https"] === "true" ? true : undefined,
    host: result["host"] || undefined,
    port: result["port"] ? parseInt(result["port"], 10) : undefined,
    username: result["username"] || undefined,
    password: result["password"] || undefined,
  };
}

/**
 * Резолвит опции подключения с приоритетом: CLI > btconfig.properties > defaults
 *
 * @param cwd - директория проекта (для чтения btconfig.properties)
 * @param cliOptions - опции из CLI (наивысший приоритет)
 * @returns полные опции подключения с заполненными дефолтами
 */
export function resolvePushConnectionOptions(cwd: string, cliOptions: PartialPushConnectionOptions = {}): PushConnectionOptions {
  const configOptions = parseBtConfigProperties(cwd);

  return {
    https: cliOptions.https ?? configOptions.https ?? DEFAULTS.https,
    host: cliOptions.host ?? configOptions.host ?? DEFAULTS.host,
    port: cliOptions.port ?? configOptions.port ?? DEFAULTS.port,
    username: cliOptions.username ?? configOptions.username ?? DEFAULTS.username,
    password: cliOptions.password ?? configOptions.password ?? DEFAULTS.password,
  };
}
