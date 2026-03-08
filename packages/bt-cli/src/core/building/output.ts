/**
 * Пост-обработка выходных файлов
 *
 * Отвечает за:
 * - Трансформацию JS в XML/HTML форматы
 * - Декодирование Unicode escape последовательностей
 * - Добавление BOM
 *
 * @module build/output
 */

import { xmlBuilder as spxmlBuilder } from "../utils/xml.js";
import type { BtcCompileOptions } from "./types.js";

/**
 * Результат трансформации выходного файла
 */
export interface OutputTransformResult {
  /** Новое имя файла (может измениться расширение) */
  fileName: string;
  /** Трансформированное содержимое */
  content: string;
}

/**
 * Трансформирует выходной файл
 *
 * Применяет пост-обработку к сгенерированному JS коду:
 * - Конвертация в XML для файлов с `/// @xml-init`
 * - Конвертация в HTML для файлов с `/// @html`
 * - Декодирование Unicode escape sequences
 * - Добавление BOM (Byte Order Mark)
 *
 * @param fileName - Имя выходного файла
 * @param code - Сгенерированный код
 * @param options - Опции компиляции
 */
export function transformOutput(
  fileName: string,
  code: string,
  options: BtcCompileOptions,
): OutputTransformResult {
  let resultFileName = fileName;
  let resultCode = code;

  // Конвертация в SPXML формат
  // TODO: заменить на import стиль
  if (resultCode.indexOf("/// @xml-init") !== -1) {
    // Убираем запрещённые управляющие символы (кроме \t, \n, \r)
    resultCode = stripControlChars(resultCode);
    resultCode = indentString(resultCode, "\t\t");

    const xmlObj = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      "SPXML-INLINE-FORM": {
        OnInit: {
          "@_PROPERTY": "1",
          "@_EXPR": "\n" + resultCode + "\n\t",
        },
      },
    };

    resultCode = spxmlBuilder.build(xmlObj);
    resultFileName = resultFileName.replace(".js", ".xml");
  }

  // Конвертация в ASP.NET HTML формат
  // TODO: заменить на import стиль
  if (resultCode.indexOf("/// @html") !== -1) {
    resultCode = `<%\n${resultCode}\n%>`;
    resultFileName = resultFileName.replace(".js", ".html");
  }

  // Декодирование Unicode escape последовательностей
  if (options.retainNonAsciiCharacters !== true) {
    resultCode = decodeUnicodeEscapes(resultCode);
  }

  // Добавление BOM для корректной кодировки
  resultCode = "\uFEFF" + resultCode;

  return {
    fileName: resultFileName,
    content: resultCode,
  };
}

/**
 * Декодирует Unicode escape последовательности в строке
 *
 * @example
 * decodeUnicodeEscapes('\\u0041') // 'A'
 */
export function decodeUnicodeEscapes(code: string): string {
  return code.replace(/\\u[\dA-Fa-f]{4}/g, (match) => {
    return String.fromCharCode(parseInt(match.substr(2), 16));
  });
}

/**
 * Удаляет запрещённые управляющие символы из строки.
 * Сохраняет tab (\\t), newline (\\n), carriage return (\\r).
 */
export function stripControlChars(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Добавляет отступ к каждой строке
 */
export function indentString(value: string, indent: string): string {
  return value
    .split("\n")
    .map((line) => indent + line)
    .join("\n");
}
