const object: any = {
    a: {
        b: {
            c: 42
        }
    }
}

const result = `HELLO ${object?.a?.b?.c} WORLD`;

botest.assertValueEquals(result, "HELLO 42 WORLD", "Optional chaining should correctly access nested properties");


botest.assertOk();

export {};
