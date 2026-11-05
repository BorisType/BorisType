function probeCatchBindingCollision(): string {
  let __caught0 = "source";
  let trace = "";

  try {
    throw "inner";
  } catch (error) {
    trace += "C";
  }

  return trace + "|" + __caught0;
}

botest.assertValueEquals(probeCatchBindingCollision(), "C|source", "generated catch binding must not collide with a source identifier");

botest.assertOk();

export {};
