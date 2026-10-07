const read = () => "outer";
let trace = "";
try {
  throw "caught";
} catch (read: any) {
  read = () => "inner";
  trace += read();
}
trace += read();
botest.assertValueEquals(trace, "innerouter", "catch callable binding must not resolve to its outer function");
botest.assertOk();
export {};
