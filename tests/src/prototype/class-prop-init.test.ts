// Тест: Class property initializers (поля с инициализаторами)
class Config {
    host: string = "localhost";
    port: number = 8080;
    debug: boolean = false;

    constructor(host: string) {
        this.host = host;
    }

    getUrl(): string {
        return this.host + ":" + this.port;
    }
}

const cfg = new Config("example.com");

// host перезаписан конструктором
botest.assertValueEquals(cfg.host, "example.com", "host overridden by constructor");

// port и debug — из инициализаторов
botest.assertValueEquals(cfg.port, 8080, "port from initializer");
botest.assertValueEquals(cfg.debug, false, "debug from initializer");

// Метод
botest.assertValueEquals(cfg.getUrl(), "example.com:8080", "getUrl()");

botest.assertOk();

export {};
