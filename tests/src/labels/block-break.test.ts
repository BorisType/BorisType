let blockTrace = "";

unused: {
  blockTrace += "U";
}

done: {
  blockTrace += "A";
  break done;
  blockTrace += "X";
}

blockTrace += "B";

botest.assertValueEquals(blockTrace, "UAB", "break must skip the remainder of an arbitrary labeled block");
botest.assertOk();

export {};
