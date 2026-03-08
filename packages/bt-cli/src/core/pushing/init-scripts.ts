/**
 * Сбор init-скриптов для reinit модулей
 *
 * Чистые функции без сетевых вызовов — только работа с файловой системой.
 *
 * @module core/pushing/init-scripts
 */

import * as path from "path";
import * as fs from "fs";
import { xmlParser } from "../utils/xml";
import { logger } from "../logger";
import type { InitScript } from "./types";

/**
 * Собирает init-скрипты из компонентов (директории в dist/components/)
 *
 * Для каждой поддиректории генерируется вызов `<componentName>.init()`.
 *
 * @param distPath - путь к папке dist
 * @returns массив init-скриптов компонентов
 */
export function collectComponentInitScripts(distPath: string): InitScript[] {
  const componentsPath = path.join(distPath, "components");
  if (!fs.existsSync(componentsPath) || !fs.lstatSync(componentsPath).isDirectory()) {
    return [];
  }

  const result: InitScript[] = [];
  const componentDirs = fs
    .readdirSync(componentsPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const componentName of componentDirs) {
    const initCode = `${componentName}.init()`;
    result.push({ type: "component", name: componentName, code: initCode });
  }

  return result;
}

/**
 * Собирает init-скрипты из standalone модулей (через api_ext.xml)
 *
 * Парсит `dist/source/api_ext.xml`, находит API-модули и извлекает
 * OnInit EXPR из их init XML файлов.
 *
 * @param distPath - путь к папке dist
 * @returns массив init-скриптов standalone модулей
 */
export function collectStandaloneInitScripts(distPath: string): InitScript[] {
  const apiExtPath = path.join(distPath, "source", "api_ext.xml");
  if (!fs.existsSync(apiExtPath)) {
    return [];
  }

  const result: InitScript[] = [];
  const xmlContent = fs.readFileSync(apiExtPath, "utf-8");

  const parsed = xmlParser.parse(xmlContent);
  const apis = parsed?.api_ext?.apis?.api;
  if (!apis) {
    return [];
  }

  // Нормализуем в массив (может быть один объект или массив)
  const apiList = Array.isArray(apis) ? apis : [apis];

  for (const api of apiList) {
    const name = api.name || "unknown";
    const libs = api.libs?.lib;
    if (!libs) continue;

    const libList = Array.isArray(libs) ? libs : [libs];

    for (const lib of libList) {
      const libPath = lib.path;
      if (!libPath || typeof libPath !== "string") continue;

      // Резолвим путь: x-local://wt/myapp/init.xml -> dist/wt/myapp/init.xml
      const resolvedPath = resolveXLocalPath(distPath, libPath);
      if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        logger.warning(`⚠️ Init file not found: ${libPath} (resolved: ${resolvedPath})`);
        continue;
      }

      const initCode = extractOnInitFromXml(resolvedPath);
      if (initCode) {
        result.push({ type: "standalone", name, code: initCode });
      }
    }
  }

  return result;
}

/**
 * Резолвит x-local:// путь в локальный путь относительно dist
 *
 * @param distPath - путь к папке dist
 * @param xLocalPath - путь вида "x-local://wt/myapp/init.xml"
 * @returns локальный путь или null если формат некорректный
 */
export function resolveXLocalPath(distPath: string, xLocalPath: string): string | null {
  const match = xLocalPath.match(/^x-local:\/\/(.+)$/);
  if (!match) return null;
  return path.join(distPath, match[1]);
}

/**
 * Извлекает содержимое OnInit EXPR из XML файла
 *
 * @param xmlPath - путь к XML файлу
 * @returns код из OnInit EXPR атрибута или null
 */
export function extractOnInitFromXml(xmlPath: string): string | null {
  const xmlContent = fs.readFileSync(xmlPath, "utf-8");

  const parsed = xmlParser.parse(xmlContent);

  // Ищем OnInit в любом месте структуры
  const onInit = findOnInit(parsed);
  if (!onInit) return null;

  const expr = onInit["@_EXPR"];
  if (typeof expr === "string") {
    return expr.trim();
  }

  return null;
}

/**
 * Рекурсивно ищет элемент OnInit в parsed XML
 *
 * @param obj - объект для поиска
 * @returns объект OnInit или null
 */
export function findOnInit(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;

  const record = obj as Record<string, unknown>;

  if ("OnInit" in record && record["OnInit"] && typeof record["OnInit"] === "object") {
    return record["OnInit"] as Record<string, unknown>;
  }

  for (const value of Object.values(record)) {
    const found = findOnInit(value);
    if (found) return found;
  }

  return null;
}
