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
  /** Whether to include this suite in Node.js validation. Default: true. */
  nodeCheck?: boolean;
}

/** Options controlling test runner behavior. */
export interface RunOptions {
  /** When true, print every test result including PASSED. Default: false. */
  verbose: boolean;
  /** When true, also run tests in Node.js to validate test logic. Default: false. */
  nodeCheck: boolean;
}
