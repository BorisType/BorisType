let switchContinueTrace = "";

for (let i = 0; i < 2; i++) {
  try {
    switch (i) {
      case 0:
      case 1:
        switchContinueTrace += "T" + i;
        continue;
    }

    switchContinueTrace += "X";
  } finally {
    switchContinueTrace += "F" + i;
  }

  switchContinueTrace += "N";
}

botest.assertValueEquals(switchContinueTrace, "T0F0T1F1", "continue inside switch must target the loop and execute finally");
botest.assertOk();

export {};
