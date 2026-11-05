let commaUpdateTrace = "";

outer: for (let i = 0; i < 3; commaUpdateTrace += "U", i++) {
  try {
    commaUpdateTrace += i;
    continue outer;
  } finally {
    commaUpdateTrace += "F";
  }
}

botest.assertValueEquals(commaUpdateTrace, "0FU1FU2FU", "comma update runs once after finally on labelled continue");
botest.assertOk();

export {};
