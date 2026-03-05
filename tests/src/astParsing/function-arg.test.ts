function testComplexExpressions(aaa: number, bbb: number) {
    return {
        aaa: aaa,
        bbb: bbb,
    }
}

const a = 1;
const b = 2;
const c = 3;

testComplexExpressions(a > 1 ? b : c, 2);

botest.assertOk();

export {};