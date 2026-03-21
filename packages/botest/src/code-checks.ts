import type { CodeCheckRule, CodeCheckResult, CodeCheckViolation } from "./types";

/**
 * Validates compiled test code against regex-based rules.
 * Used to verify transpiler output properties that cannot be checked at runtime
 * (e.g. type-aware property access should not produce `getProperty` calls).
 *
 * @param code - The compiled `.js` file content.
 * @param rule - The code check rule with `forbid` and/or `require` patterns.
 * @returns Result indicating whether all checks passed, with violation details.
 */
export function runCodeCheck(code: string, rule: CodeCheckRule): CodeCheckResult {
  const violations: CodeCheckViolation[] = [];
  const lines = code.split("\n");

  if (rule.forbid) {
    for (const pattern of rule.forbid) {
      const regex = new RegExp(pattern);
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(regex);
        if (match) {
          violations.push({
            type: "forbid",
            pattern,
            line: i + 1,
            match: match[0],
          });
        }
      }
    }
  }

  if (rule.require) {
    for (const pattern of rule.require) {
      const regex = new RegExp(pattern);
      if (!regex.test(code)) {
        violations.push({
          type: "require",
          pattern,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Formats code check violations into a human-readable error string
 * for display in test output.
 */
export function formatCodeCheckViolations(violations: CodeCheckViolation[]): string {
  return violations
    .map((v) => {
      if (v.type === "forbid") {
        return `Code check: forbidden pattern /${v.pattern}/ found at line ${v.line} ("${v.match}")`;
      }
      return `Code check: required pattern /${v.pattern}/ not found in compiled output`;
    })
    .join("\n");
}
