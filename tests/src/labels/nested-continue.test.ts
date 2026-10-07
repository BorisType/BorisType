let continueTrace = "";

outer: for (let i = 0; i < 3; i++) {
  continueTrace += "I" + i;

  for (let j = 0; j < 3; j++) {
    if (j === 0) {
      continueTrace += "a";
      continue;
    }

    if (j === 1) {
      continueTrace += "b";
      continue outer;
    }

    continueTrace += "X";
  }

  continueTrace += "Y";
}

botest.assertValueEquals(continueTrace, "I0abI1abI2ab", "continue outer must preserve the outer for update");
botest.assertOk();

export {};
