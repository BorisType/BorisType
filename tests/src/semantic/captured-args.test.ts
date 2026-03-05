export function createApp(basePath: string): any {
    const app = {
        registered: false,
        key: "",
        register() {
            if (this.registered) {
                throw new Error("App is already registered");
            }

            const httpKey = Md5Hex(basePath);
            this.key = httpKey;

            this.registered = true;
        }
    };

    return app;
}

const app = createApp("/my/app");
app.register();
botest.assertTrue(app.registered, "App should be registered after calling register()");
botest.assertTrue(app.key !== "", "App should have a key after registration");


botest.assertOk();

export {};
