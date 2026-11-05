function probeCapturedCatchBinding(): string {
  let readCaught: () => string = () => "missing";

  try {
    throw "inner";
  } catch (error) {
    readCaught = () => error + "";
  }

  return readCaught();
}

botest.assertTrue(
  StrBegins(probeCapturedCatchBinding(), "inner"),
  "closure created in catch must retain the caught value after the catch exits",
);

botest.assertOk();

export {};
