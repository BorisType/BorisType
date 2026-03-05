import * as https from 'https';
import * as http from 'http';
import { WshcmClientOptions } from './types.js';
import { UnauthorizedError, WshcmException } from './exceptions.js';
import { renderRequest, parseResponse } from './soap-utils.js';
import { Evaluator } from './evaluator.js';

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
    private cookies: string[] = [];
    private isHttps: boolean;
    private requestTimeout: number;

    /**
     * Создает новый экземпляр WSHCM-клиента
     * @param options - опции подключения
     */
    constructor(options: WshcmClientOptions) {
        this.isHttps = options.overHttps;
        this.baseUrl = `${options.overHttps ? 'https' : 'http'}://${options.host}:${options.port}`;
        this.username = options.username;
        this.password = options.password;
        this.requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
    }

    /**
     * Инициализирует клиент и проверяет авторизацию
     * Должен быть вызван после создания экземпляра
     */
    async initialize(): Promise<void> {
        const statusCode = await this.makeRequest('/spxml_web/main.htm', 'GET');
        if (statusCode !== 200) {
            throw new UnauthorizedError();
        }
    }

    /**
     * Вызывает метод через SP-XML API
     * @template T - тип возвращаемого значения
     * @param lib - библиотека/модуль (например, "tools", или URL модуля)
     * @param method - имя метода
     * @param methodArgs - массив аргументов метода
     * @returns результат выполнения метода
     */
    async callMethod<T = any>(lib: string, method: string, methodArgs: any[] = []): Promise<T> {
        const headers = {
            'accept': '*/*',
            'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'cache-control': 'no-cache',
            'content-type': 'application/soap+xml; charset=UTF-8',
            'pragma': 'no-cache',
            'x-spxml-client': 'SP-XML Web client 1.0',
        };

        const body = renderRequest(lib, method, methodArgs);
        const responseText = await this.makeRequest('/api/spxml/CallMethod', 'POST', headers, body);

        return parseResponse(responseText as string) as T;
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
        headers: Record<string, string> = {},
        body?: string
    ): Promise<number | string> {
        return new Promise((resolve, reject) => {
            const url = new URL(this.baseUrl + path);
            const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
            
            const allHeaders: Record<string, string> = {
                ...headers,
                'Authorization': `Basic ${auth}`,
            };

            if (this.cookies.length > 0) {
                allHeaders['Cookie'] = this.cookies.join('; ');
            }

            if (body) {
                allHeaders['Content-Length'] = Buffer.byteLength(body).toString();
            }

            const options: http.RequestOptions = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: allHeaders,
                timeout: this.requestTimeout,
            };

            const lib = this.isHttps ? https : http;
            const req = lib.request(options, (res) => {
                // Сохраняем cookies
                const setCookie = res.headers['set-cookie'];
                if (setCookie) {
                    this.cookies.push(...setCookie.map(cookie => cookie.split(';')[0]));
                }

                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (method === 'GET') {
                        resolve(res.statusCode || 500);
                    } else {
                        resolve(data);
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new WshcmException(`Request timed out after ${this.requestTimeout}ms: ${method} ${path}`));
            });

            req.on('error', (error) => {
                reject(new WshcmException(`Request failed: ${error.message}`));
            });

            if (body) {
                req.write(body);
            }

            req.end();
        });
    }
}
