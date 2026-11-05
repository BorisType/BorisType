/** Deliberately synchronous hang: fixture for the out-of-process watchdog, no interpreter involved. */
process.once("message", () => {
  while (true) {
    /* watchdog must terminate this process */
  }
});
