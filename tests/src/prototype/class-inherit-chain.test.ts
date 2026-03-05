/**
 * Test: three-level class inheritance chain
 */

class Base {
    kind: string;
    constructor() {
        this.kind = "base";
    }
    baseMethod(): string {
        return "from-base";
    }
}

class Middle extends Base {
    constructor() {
        super();
        this.kind = "middle";
    }
    middleMethod(): string {
        return "from-middle";
    }
}

class Leaf extends Middle {
    constructor() {
        super();
        this.kind = "leaf";
    }
    leafMethod(): string {
        return "from-leaf";
    }
}

const leaf: any = new Leaf();

// Собственный метод
botest.assertValueEquals(leaf.leafMethod(), "from-leaf", "leaf.leafMethod()");

// Метод из Middle (1 уровень вверх)
botest.assertValueEquals(leaf.middleMethod(), "from-middle", "leaf.middleMethod() from Middle");

// Метод из Base (2 уровня вверх)
botest.assertValueEquals(leaf.baseMethod(), "from-base", "leaf.baseMethod() from Base");

// Свойство из конструктора Leaf (перезаписано после super())
botest.assertValueEquals(leaf.kind, "leaf", "leaf.kind set in own constructor");

botest.assertOk();
export {};
