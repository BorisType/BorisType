function createFunctions() {
    const funcs = [];

    let x = 10;
    const y = 20;

    funcs.push(() => console.log(x, y));

    x = 100;    // можно
    // y = 200; // ошибка!

    funcs.push(() => console.log(x, y));

    return funcs;
}

const [f1, f2] = createFunctions();
f1(); // 100 20
f2(); // 100 20