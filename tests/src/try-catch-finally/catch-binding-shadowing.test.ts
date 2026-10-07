function probeCatchBindingShadowing(): string {
  let error = "outer";
  let trace = "";

  try {
    throw "inner";
  } catch (error) {
    trace += "C";
  }

  return trace + "|" + error;
}

botest.assertValueEquals(probeCatchBindingShadowing(), "C|outer", "catch binding must not overwrite an outer variable with the same name");

botest.assertOk();

export {};
