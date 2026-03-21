/** Represents a single test case to be executed. */
export interface TestCase {
  /** Relative path to the compiled test file. */
  filePath: string;
  /** Name of the test suite this test belongs to. */
  suite: string;
  /** Human-readable name of the test. */
  name: string;
  /** BorisScript code to execute. */
  code: string;
}

/** Result of a single test execution. */
export interface TestResult {
  /** Name of the test suite. */
  suite: string;
  /** Human-readable name of the test. */
  name: string;
  /** Final status of the test. */
  status: TestStatus;
  /** Execution time in milliseconds. */
  time: number;
  /** Assertion details if the test failed due to an assertion. */
  assertion?: TestAssertionResult;
  /** Error object if the test failed due to a runtime error. */
  error?: any;
}

/** Assertion failure details. */
export interface TestAssertionResult {
  /** Description of the failed assertion. */
  message: string;
  /** Expected value. */
  expected: string;
  /** Actual value. */
  actual: string;
}

/** Possible test statuses. */
export type TestStatus = "PASSED" | "FAILED" | "SKIPPED";

/** Metadata for a test suite loaded from `_suite.json`. */
export interface TestSuite {
  /** Absolute path to the suite directory. */
  dirPath: string;
  /** Human-readable suite name. */
  name: string;
  /** Map of test file names (`.test.js`) to their display names. */
  tests: { [key: string]: string };
  /** Set to `false` to skip the entire suite in Node.js validation. Default: true. */
  nodeCheck?: boolean;
  /** List of test file names (`.test.js`) to skip in Node.js validation. */
  skipNodeCheck?: string[];
  /** Per-test regex validation rules for compiled output. Keys are `.test.js` file names. */
  codeChecks?: { [key: string]: CodeCheckRule };
}

/** Regex-based validation rule for compiled test output. */
export interface CodeCheckRule {
  /** Regex patterns that must NOT match in the compiled code. */
  forbid?: string[];
  /** Regex patterns that MUST match in the compiled code. */
  require?: string[];
}

/** Single code check violation. */
export interface CodeCheckViolation {
  /** Whether the pattern was forbidden or required. */
  type: "forbid" | "require";
  /** The regex pattern that triggered the violation. */
  pattern: string;
  /** Line number where the forbidden pattern was found (1-based). Only for `forbid`. */
  line?: number;
  /** The matched text. Only for `forbid`. */
  match?: string;
}

/** Result of running code checks on a compiled test file. */
export interface CodeCheckResult {
  /** Whether all code checks passed. */
  passed: boolean;
  /** List of violations found. */
  violations: CodeCheckViolation[];
}

/** Options controlling test runner behavior. */
export interface RunOptions {
  /** When true, print every test result including PASSED. Default: false. */
  verbose: boolean;
  /** When true, also run tests in Node.js to validate test logic. Default: false. */
  nodeCheck: boolean;
}
