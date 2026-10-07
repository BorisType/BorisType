let forOfTrace = "";

outer: for (const value of [1, 2, 3, 4]) {
  if (value === 2) {
    continue outer;
  }

  forOfTrace += value;

  if (value === 3) {
    break outer;
  }
}

botest.assertValueEquals(forOfTrace, "13", "expanded for-of must retain its source label target");
botest.assertOk();

export {};
