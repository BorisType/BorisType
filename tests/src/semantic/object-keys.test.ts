const aaa = 1;
const bbb = 2;

const object = {
  aaa,
  bbb: bbb,
};

botest.assertValueEquals(object.aaa, 1, "object.aaa should be 1");
botest.assertValueEquals(object.bbb, 2, "object.bbb should be 2");

botest.assertOk();

export {};
