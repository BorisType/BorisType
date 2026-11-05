let optionalBindingTrace = "";

try {
  throw "ignored";
} catch {
  optionalBindingTrace += "C";
}

botest.assertValueEquals(optionalBindingTrace, "C", "optional catch binding must compile to target-safe syntax");

botest.assertOk();

export {};
