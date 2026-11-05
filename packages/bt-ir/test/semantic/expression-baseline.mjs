/** Exact known mismatches, accepted only with --baseline. Never catches infrastructure errors. */
const mismatches = [
  ["r01-and-skip", "R01", "0|false", "1|false"],
  ["r01-or-skip", "R01", "0|true", "1|true"],
  ["r01-conditional-skip", "R01", "0|7", "1|7"],
  ["r01-nullish-skip", "R01", "0|7", "1|7"],
  ["r02-argument-order", "R02", "AB|3", "BA|3"],
  ["r03-while-frequency", "R03", "3|2", "1|5"],
  ["early-value-before-mutation", "E-05", "9|3", "9|11"],
  ["skipped-throw", "E-04", "A", "XC"],
  ["argument-throw-order", "E-05", "AXC", "XC"],
  ["receiver-before-argument", "E-05", "RAB|3", "BRA|3"],
  ["elseif-skipped-test", "E-07", "T", "XT"],
  ["for-test-frequency", "E-06", "3|2", "1|5"],
  ["do-test-frequency", "E-06", "3|3", "1|5"],
  ["for-update-frequency", "E-06", "0U1U2U|3", "U012|3"],
  ["array-element-order", "E-07", "AB|3", "BA|3"],
  ["optional-key-skip", "E-04", "0|undefined", "1|undefined"],
  ["object-method-branch-skip", "E-04", "0|false", "1|false"],
  ["parameter-default-skipped", "E-07", "0|7", "1|7"],
  ["parameter-default-before-body", "E-07", "1|9", "0|C"],
];

export const expressionBaseline = Object.fromEntries(
  mismatches.flatMap(([id, finding, expected, actual]) =>
    ["script", "module"].map((mode) => [
      `${id}/${mode}`,
      { finding, expected, actual, reason: "Pending execution escapes its expression evaluation point" },
    ]),
  ),
);
