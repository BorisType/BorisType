function main() {
    alert("Hello, world!");
    const a = 5;
    const a__0 = 100;
    if (a > 3) {
        const a = 10;
        alert(a);
    }

    return {
        object: true,
        sayHello(name: string) {
            alert(`Method called within object (${a})`);
            alert(`Hello, ${name}!`);
        },
    }
}

const myObj = main();
myObj.sayHello("Jhon");