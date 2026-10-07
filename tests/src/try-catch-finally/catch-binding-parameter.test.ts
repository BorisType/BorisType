function parameterCatchProbe(error: string): string {
  let trace = "";
  try {
    throw "caught";
  } catch (error) {
    error = "inner";
    {
      let error = "block";
      trace += error;
    }
    trace += error;
  }
  return trace + error;
}

botest.assertValueEquals(parameterCatchProbe("outer"), "blockinnerouter", "catch must shadow its parameter only within its lexical scope");
botest.assertOk();
export {};
