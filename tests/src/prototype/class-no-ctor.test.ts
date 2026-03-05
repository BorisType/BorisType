// Тест: Класс без явного конструктора (default constructor)
class Point {
    x: number = 0;
    y: number = 0;

    toString(): string {
        return "(" + this.x + ", " + this.y + ")";
    }
}

const p = new Point();

// Property initializers должны отработать
botest.assertValueEquals(p.x, 0, "p.x should be 0");
botest.assertValueEquals(p.y, 0, "p.y should be 0");

// Метод из прототипа
botest.assertValueEquals(p.toString(), "(0, 0)", "p.toString()");

botest.assertOk();

export {};
