function foo() {
    return 1;
}
const result = foo();
botest.assertValueEquals(result, 1, "foo() should return 1");

function bar(a: number, b: number) {
    return a + b;
}
const result2 = bar(1, 2);
botest.assertValueEquals(result2, 3, "bar(1, 2) should return 3");

function createFunctions() {
    const funcs = [];

    let x = 10;
    const y = 20;

    if (true) {
        const aa = 50;
        funcs.push(() => {
            aa
            botest.assertValueEquals(x, 100, "x should be 100");
            botest.assertValueEquals(y, 20, "y should be 20");

            const func = () => { }
        });

        x = 100;

        funcs.push(() => {
            aa
            botest.assertValueEquals(x, 100, "x should be 100");
            botest.assertValueEquals(y, 20, "y should be 20");

            const func = () => { }
        });
    }


    return funcs;
}

const [f1, f2] = createFunctions();
f1();
f2();


botest.assertOk();

export { };
