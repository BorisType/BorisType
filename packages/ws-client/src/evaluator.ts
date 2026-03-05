import { WshcmClient } from './client.js';

/**
 * Evaluator для выполнения произвольного BorisScript-кода на сервере
 * 
 * Создает временный модуль на сервере с функциями execute и drop_self,
 * позволяя выполнять динамический код через eval.
 * 
 * @example
 * ```typescript
 * const evaluator = client.evaluator;
 * await evaluator.initialize();
 * const result = await evaluator.eval('return 2 + 2;');
 * await evaluator.close();
 * ```
 */
export class Evaluator {
    private client: WshcmClient;
    private evalKey: string;
    private libUrl: string;
    private initialized = false;

    /**
     * Создает новый evaluator
     * @param client - экземпляр WshcmClient
     */
    constructor(client: WshcmClient) {
        this.client = client;
        this.evalKey = 'unsafe_eval_' + this.generateRandomString(32);
        this.libUrl = `x-local://wt/${this.evalKey}.bs`;
    }

    /**
     * Инициализирует evaluator, создавая временный модуль на сервере
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        const content = this.getUnsafeEvalScript();
        await this.client.callMethod('tools', 'put_url_text_server', [this.libUrl, content]);
        this.initialized = true;
    }

    /**
     * Выполняет произвольный BorisScript-код на сервере
     * @param code - код для выполнения
     * @returns результат выполнения
     */
    async eval(code: string): Promise<any> {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.client.callMethod(this.libUrl, 'execute', [code]);
    }

    async evalCode(code: string): Promise<any> {
        // Оборачиваем код в функцию, чтобы явно не возвращать никакого результата всего сегмента кода, даже если в коде есть return
        const randomFuncName = '__evaluator_wrapper_' + this.generateRandomString(32);
        const wrappedCode = `function ${randomFuncName}() {\n${code}\n}\n${randomFuncName}();return;`;
        return this.eval(wrappedCode);
    }

    async evalExpr(expr: string): Promise<any> {
        return this.eval(expr);
    }

    /**
     * Закрывает evaluator и удаляет временный модуль с сервера
     * @returns true если удаление успешно, false в противном случае
     */
    async close(): Promise<boolean> {
        if (!this.initialized) {
            return false;
        }
        try {
            const result = await this.client.callMethod(this.libUrl, 'drop_self', []);
            this.initialized = false;
            return result;
        } catch {
            return false;
        }
    }

    /**
     * Генерирует случайную строку заданной длины
     */
    private generateRandomString(length: number): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Возвращает содержимое временного модуля unsafe_eval.bs
     */
    private getUnsafeEvalScript(): string {
        return `"META:ALLOW-CALL-FROM-CLIENT:1"
function execute(code) {
    return eval(code);
}

"META:ALLOW-CALL-FROM-CLIENT:1"
function drop_self() {
    try {
        DeleteFile("${this.libUrl}");
        return true;
    } catch (err) {
        return false;
    }
}`;
    }
}
