declare namespace botest {
    function assertOk(): void;
    function assertFail(message?: string): void;

    function assertValueEquals(actual: any, expected: any, message?: string): void;
    function assertJsArrayEquals(actual: any[], expected: any[], message?: string): void;
    function assertJsObjectEquals(actual: any, expected: any, message?: string): void;

    function assertTrue(value: any, message?: string): void;
    function assertFalse(value: any, message?: string): void;
}