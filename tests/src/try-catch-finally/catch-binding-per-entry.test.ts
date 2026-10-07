const readers: Array<() => string> = [];
for (let i = 0; i < 3; i++) {
  try {
    throw "caught";
  } catch (error) {
    error = "entry" + i;
    readers.push(() => error as string);
  }
}
botest.assertValueEquals(readers[0](), "entry0", "first catch closure retains its own entry binding");
botest.assertValueEquals(readers[1](), "entry1", "second catch closure retains its own entry binding");
botest.assertValueEquals(readers[2](), "entry2", "third catch closure retains its own entry binding");
botest.assertOk();
export {};
