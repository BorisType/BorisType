function finallyOverrides(): string {
  try {
    return "from-try";
  } finally {
    return "from-finally";
  }
}

const val = finallyOverrides();

botest.assertValueEquals(val, "from-finally", "return in finally should override return in try");

botest.assertOk();

export {};
