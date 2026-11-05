let loopJumpTrace = "";

outer: for (let i = 0; i < 3; i++) {
  try {
    if (i === 0) {
      continue outer;
    }

    if (i === 1) {
      break outer;
    }

    loopJumpTrace += "X";
  } finally {
    loopJumpTrace += "F" + i;
  }

  loopJumpTrace += "N";
}

loopJumpTrace += "A";

botest.assertValueEquals(loopJumpTrace, "F0F1A", "break and continue must run finally before reaching the loop target");
botest.assertOk();

export {};
