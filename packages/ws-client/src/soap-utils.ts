import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { WshcmException } from "./exceptions.js";

// ============================================================================
// XML Parser / Builder instances
// ============================================================================

/**
 * XMLParser для SOAP-ответов.
 * `removeNSPrefix: true` убирает namespace-префиксы (soap:Envelope → Envelope),
 * что позволяет обращаться к элементам напрямую без привязки к префиксам сервера.
 */
const soapParser = new XMLParser({
  ignoreAttributes: false,
  htmlEntities: true,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
});

/**
 * XMLBuilder для формирования SOAP-запросов.
 * Автоматически экранирует XML-сущности в значениях и атрибутах.
 */
const soapBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "    ",
  suppressEmptyNode: false,
  processEntities: true,
});

// ============================================================================
// Request Building
// ============================================================================

/**
 * Преобразует аргумент метода в объект для XMLBuilder
 * @param arg - значение аргумента
 * @returns объект с VALUE-TYPE атрибутом и текстовым содержимым
 */
function buildArgumentValue(arg: any): { "@_VALUE-TYPE": string; "#text"?: string | number } {
  if (typeof arg === "string") {
    return {
      "@_VALUE-TYPE": "string",
      "#text": arg,
    };
  }

  if (typeof arg === "number") {
    return {
      "@_VALUE-TYPE": Number.isInteger(arg) ? "integer" : "real",
      "#text": arg,
    };
  }

  if (typeof arg === "boolean") {
    return {
      "@_VALUE-TYPE": "bool",
      "#text": arg ? 1 : 0,
    };
  }

  if (arg === null || arg === undefined) {
    return { "@_VALUE-TYPE": "string", "#text": "" };
  }

  // Для объектов и массивов — неподдерживаемый тип, используем JSON как строку
  try {
    return { "@_VALUE-TYPE": "string", "#text": JSON.stringify(arg) };
  } catch {
    throw new WshcmException("Unsupported argument type");
  }
}

/**
 * Рендерит SOAP-запрос для вызова метода
 * @param lib - библиотека/модуль
 * @param method - имя метода
 * @param methodArgs - аргументы метода
 * @returns XML-строка SOAP-запроса
 */
export function renderRequest(lib: string, method: string, methodArgs: any[]): string {
  const argData: Record<string, any> = {};
  for (let i = 0; i < methodArgs.length; i++) {
    argData[`arg-${i}`] = buildArgumentValue(methodArgs[i]);
  }

  const requestObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "utf-8" },
    "soap:Envelope": {
      "@_xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "@_xmlns": "http://www.datex-soft.com/soap/",
      "soap:Body": {
        CallMethod: {
          LibName: lib,
          MethodName: method,
          ArgData: argData,
        },
      },
    },
  };

  return soapBuilder.build(requestObj);
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Рекурсивно ищет элемент по имени в распарсенном XML-объекте.
 * Аналог SimpleXmlParser.findElement — ищет ключ на любом уровне вложенности.
 *
 * @param obj - распарсенный XML-объект
 * @param key - имя искомого элемента
 * @returns найденный элемент или undefined
 */
function findElement(obj: unknown, key: string): any {
  if (!obj || typeof obj !== "object") return undefined;

  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];

  for (const val of Object.values(record)) {
    const found = findElement(val, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Парсит значение элемента на основе VALUE-TYPE атрибута.
 *
 * fast-xml-parser представляет элемент с атрибутами как объект:
 * - `@_VALUE-TYPE` — тип значения
 * - `#text` — текстовое содержимое (может отсутствовать для пустых элементов)
 * - остальные ключи — дочерние элементы (для Object/Array типов)
 *
 * @param element - распарсенный XML-элемент
 * @returns JS-значение соответствующего типа
 */
function parseResultValue(element: any): any {
  if (element === undefined || element === null) return undefined;

  // Если элемент — примитив (нет атрибутов), вернуть как есть
  if (typeof element !== "object") return element;

  const valueType: string | undefined = element["@_VALUE-TYPE"];

  if (!valueType || valueType === "undefined" || valueType === "null") {
    return undefined;
  }

  if (valueType === "string") {
    const text = element["#text"];
    return text != null ? String(text) : "";
  }

  if (valueType === "integer") {
    return parseInt(String(element["#text"] ?? "0"), 10);
  }

  if (valueType === "real") {
    return parseFloat(String(element["#text"] ?? "0"));
  }

  if (valueType === "bool") {
    return (element["#text"] ?? 0) == 1;
  }

  if (valueType === "Object") {
    return parseResultObject(element);
  }

  if (valueType === "Array") {
    return parseResultArray(element);
  }

  throw new WshcmException(`Unexpected VALUE-TYPE: ${valueType}`);
}

/**
 * Парсит объект из распарсенного XML-элемента.
 * Итерирует дочерние ключи (исключая `@_*` атрибуты и `#text`),
 * рекурсивно разбирая каждый через {@link parseResultValue}.
 *
 * @param element - элемент с `@_VALUE-TYPE="Object"`
 * @returns JS-объект
 */
function parseResultObject(element: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(element)) {
    if (key.startsWith("@_") || key === "#text") continue;
    result[key] = parseResultValue(value);
  }

  return result;
}

/**
 * Парсит массив из распарсенного XML-элемента.
 * Итерирует дочерние ключи (исключая `@_*` атрибуты и `#text`),
 * рекурсивно разбирая каждый через {@link parseResultValue}.
 *
 * @param element - элемент с `@_VALUE-TYPE="Array"`
 * @returns JS-массив
 */
function parseResultArray(element: Record<string, any>): any[] {
  const result: any[] = [];

  for (const [key, value] of Object.entries(element)) {
    if (key.startsWith("@_") || key === "#text") continue;
    result.push(parseResultValue(value));
  }

  return result;
}

/**
 * Парсит SOAP-ответ и извлекает результат.
 *
 * Использует `fast-xml-parser` с `removeNSPrefix: true` для прозрачной
 * работы с namespace-префиксами (soap:Envelope → Envelope и т.д.).
 *
 * @param responseText - XML-строка ответа
 * @returns результат выполнения метода
 */
export function parseResponse(responseText: string): any {
  const parsed = soapParser.parse(responseText);

  // Проверяем на ошибку SOAP Fault
  const fault = findElement(parsed, "Fault");
  if (fault && typeof fault === "object") {
    const errorCode = fault.faultcode ?? "UNKNOWN";
    const errorMessage = fault.faultstring ?? "Unknown error";
    throw new WshcmException(`ERR: (${errorCode}) ${errorMessage}`);
  }

  // Ищем ResultData
  const resultData = findElement(parsed, "ResultData");
  if (!resultData) {
    return undefined;
  }

  // Ищем Result внутри ResultData
  const result = typeof resultData === "object" ? resultData.Result : undefined;
  if (result === undefined) {
    throw new WshcmException("Unexpected response: Result element not found");
  }

  return parseResultValue(result);
}
