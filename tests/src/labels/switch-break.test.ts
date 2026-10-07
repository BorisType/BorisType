let switchTrace = "";

outer: for (let i = 0; i < 3; i++) {
  switch (i) {
    case 0:
      switchTrace += "A";
      break;
    case 1:
      switchTrace += "B";
      break outer;
    default:
      switchTrace += "X";
  }

  switchTrace += "C";
}

switchTrace += "D";

botest.assertValueEquals(switchTrace, "ACBD", "switch break and break outer must resolve to different targets");
botest.assertOk();

export {};
