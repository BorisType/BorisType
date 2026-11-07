import assert from "node:assert/strict";
import { test } from "node:test";
import { closeConnection } from "../build/connection.js";

test("connection close requires positive evaluator cleanup confirmation", async () => {
  await closeConnection({ evaluator: { close: async () => true } });
  await assert.rejects(closeConnection({ evaluator: { close: async () => false } }), /cleanup was not confirmed/);
});

test("connection close propagates cleanup errors", async () => {
  const error = new Error("Unavailable");
  await assert.rejects(
    closeConnection({
      evaluator: {
        close: async () => {
          throw error;
        },
      },
    }),
    (received) => received === error,
  );
});
