import * as https from "https";
import * as http from "http";
import type { WshcmClientOptions, WshcmRequestOptions } from "./types.js";
import { UnauthorizedError, WshcmRequestError, WshcmSoapFault } from "./exceptions.js";
import { renderRequest, parseResponse } from "./soap-utils.js";
import { Evaluator } from "./evaluator.js";

// ============================================================================
// Main WSHCM Client
// ============================================================================

/** Таймаут HTTP-запросов по умолчанию (30 секунд) */
const DEFAULT_REQUEST_TIMEOUT = 30_000;

/**
 * Клиент для работы с WebSoft HCM через SP-XML API
 *
 * @example
 * ```typescript
 * const client = new WshcmClient({
 *   overHttps: false,
 *   host: 'localhost',
 *   port: 8080,
 *   username: 'admin',
 *   password: 'password'
 * });
 *
 * await client.initialize();
 * const result = await client.callMethod<string>('tools', 'some_method', ['arg1', 'arg2']);
 *
 * const evaluator = client.createEvaluator();
 * await evaluator.initialize();
 * // ... use evaluator ...
 * await evaluator.close();
 * ```
 */
export class WshcmClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private cookies = new Map<string, string>();
  private isHttps: boolean;
  private requestTimeout: number;

  /**
   * Создает новый экземпляр WSHCM-клиента
   * @param options - опции подключения
   */
  constructor(options: WshcmClientOptions) {
    this.isHttps = options.overHttps;
    this.baseUrl = `${options.overHttps ? "https" : "http"}://${options.host}:${options.port}`;
    this.username = options.username;
    this.password = options.password;
    this.requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
  }

  /**
   * Инициализирует клиент и проверяет авторизацию
   * Должен быть вызван после создания экземпляра
   */
  async initialize(options: WshcmRequestOptions = {}): Promise<void> {
    // Start a fresh authenticated session even if the previous cookie is now refused.
    this.cookies = new Map();
    const { status } = await this.makeRequest("/spxml_web/main.htm", "GET", options);
    if (status !== 200) throw new WshcmRequestError("http", `HCM returned HTTP ${status}`, status);
  }

  /**
   * Вызывает метод через SP-XML API
   * SOAP integer возвращается как bigint, real — как number. Параметр T только
   * утверждает тип в TypeScript; он не преобразует и не проверяет результат.
   * @template T - ожидаемый вызывающим кодом тип возвращаемого значения
   * @param lib - библиотека/модуль (например, "tools", или URL модуля)
   * @param method - имя метода
   * @param methodArgs - массив аргументов метода
   * @returns результат выполнения метода
   */
  async callMethod<T = any>(lib: string, method: string, methodArgs: any[] = [], options: WshcmRequestOptions = {}): Promise<T> {
    const headers = {
      accept: "*/*",
      "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      "cache-control": "no-cache",
      "content-type": "application/soap+xml; charset=UTF-8",
      pragma: "no-cache",
      "x-spxml-client": "SP-XML Web client 1.0",
    };

    const body = renderRequest(lib, method, methodArgs);
    const response = await this.makeRequest("/api/spxml/CallMethod", "POST", options, headers, body);
    if (response.status < 200 || response.status >= 300) {
      try {
        parseResponse(response.data);
      } catch (error) {
        if (error instanceof WshcmSoapFault) throw error;
      }
      throw new WshcmRequestError("http", `HCM returned HTTP ${response.status}`, response.status);
    }
    return parseResponse(response.data) as T;
  }

  /**
   * Создаёт новый Evaluator для выполнения произвольного кода на сервере.
   *
   * Вызывающий код отвечает за lifecycle evaluator-а:
   * вызов `initialize()` перед использованием и `close()` после завершения.
   *
   * @returns новый экземпляр Evaluator
   */
  createEvaluator(): Evaluator {
    return new Evaluator(this);
  }

  /**
   * Выполняет HTTP-запрос
   * @param path - путь запроса
   * @param method - HTTP-метод
   * @param headers - заголовки
   * @param body - тело запроса
   * @returns статус-код или тело ответа
   */
  private makeRequest(
    path: string,
    method: string,
    request: WshcmRequestOptions,
    headers: Record<string, string> = {},
    body?: string,
  ): Promise<{ status: number; data: string }> {
    return new Promise((resolve, reject) => {
      const deadline = request.timeoutMs;
      if (deadline !== undefined && (!Number.isSafeInteger(deadline) || deadline <= 0))
        throw new RangeError("timeoutMs must be a positive safe integer");
      const url = new URL(this.baseUrl + path);
      const auth = Buffer.from(`${this.username}:${this.password}`).toString("base64");

      const allHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Basic ${auth}`,
      };

      // Responses already in flight belong to their original session.
      const cookies = this.cookies;
      if (cookies.size > 0) {
        allHeaders["Cookie"] = [...cookies.values()].join("; ");
      }

      if (body) {
        allHeaders["Content-Length"] = Buffer.byteLength(body).toString();
      }

      const options: http.RequestOptions = {
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: allHeaders,
        timeout: deadline === undefined ? this.requestTimeout : 0,
      };

      const lib = this.isHttps ? https : http;
      const req = lib.request(options, (res) => {
        const status = res.statusCode ?? 500;
        if (status === 401 || status === 403) {
          reject(new UnauthorizedError(`HCM authentication failed (HTTP ${status})`, status));
          res.destroy();
          return;
        }
        // Сохраняем cookies
        for (const header of res.headers["set-cookie"] ?? []) {
          const cookie = header.split(";", 1)[0];
          const separator = cookie.indexOf("=");
          if (separator > 0) cookies.set(cookie.slice(0, separator), cookie);
        }

        // Keep incomplete UTF-8 sequences between HTTP chunks instead of decoding each Buffer separately.
        res.setEncoding("utf8");
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("error", networkFailure);
        res.on("end", () => resolve({ status, data }));
      });
      function networkFailure(cause: Error) {
        reject(new WshcmRequestError("network", "Request failed: HCM connection lost or unavailable", undefined, { cause }));
      }
      const timeout = () => {
        reject(new WshcmRequestError("timeout", `Request timed out after ${deadline ?? this.requestTimeout}ms: ${method} ${path}`));
        req.destroy();
      };
      // Node coerces delays above a signed 32-bit interval to 1 ms.
      let timer: NodeJS.Timeout | undefined;
      function scheduleDeadline(remaining: number) {
        const interval = Math.min(remaining, 2147483647);
        timer = setTimeout(remaining > interval ? () => scheduleDeadline(remaining - interval) : timeout, interval);
      }
      if (deadline !== undefined) scheduleDeadline(deadline);
      req.on("close", () => clearTimeout(timer));
      req.on("timeout", timeout);
      req.on("error", networkFailure);

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }
}
