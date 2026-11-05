let jumpOverrideTrace = "";

outer: for (let i = 0; i < 3; i++) {
  try {
    jumpOverrideTrace += "T" + i;

    if (i === 0) {
      break outer;
    }

    continue outer;
  } finally {
    jumpOverrideTrace += "F" + i;

    if (i === 0) {
      continue outer;
    }

    if (i === 1) {
      break outer;
    }
  }

  jumpOverrideTrace += "N";
}

jumpOverrideTrace += "A";

botest.assertValueEquals(jumpOverrideTrace, "T0F0T1F1A", "finalizer continue/break must replace the pending loop completion");
botest.assertOk();

export {};
