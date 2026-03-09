export declare namespace botest {
  function suite(name: string, fn: () => void): void;
  function name(name: string): void;

  function assertValueEquals(actual: any, expected: any, message?: string): void;
  function assertJsArrayEquals(actual: any[], expected: any[], message?: string): void;
  function assertJsObjectEquals(actual: any, expected: any, message?: string): void;
}
