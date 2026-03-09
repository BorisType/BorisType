function main() {
  try {
    throw "Error thrown in try block";
  } catch (err) {
    botest.assertValueEquals(
      err === undefined,
      false,
      "caught hoisted variable instead of catch parameter",
    );
  }
}

main();

botest.assertOk();

export {};
