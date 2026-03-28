export namespace botest {
  export function init(): void {
    // ...
  }

  export function assertOk(): void {
    throw "TEST-RUNNER:exit:0";
  }

  export function assertFail(message: string): void {
    const assertionData = {
      message: message,
    };

    throw `TEST-RUNNER:assert:${EncodeJson(assertionData)}`;
  }

  export function assertValueEquals(actual: any, expected: any, message: string | undefined): void {
    if (message === undefined) {
      message = "NO MESSAGE PROVIDED";
    }

    if (!deepEqual(actual, expected)) {
      const data = {
        actual: actual,
        expected: expected,
        message: message,
      };

      throw `TEST-RUNNER:assert:${EncodeJson(data)}`;
    }
  }

  export function assertJsArrayEquals(actual: any[], expected: any[], message: string | undefined): void {
    assertValueEquals(actual, expected, message);
  }

  export function assertJsObjectEquals(actual: any, expected: any, message: string | undefined): void {
    assertValueEquals(actual, expected, message);
  }

  export function assertTrue(value: any, message: string | undefined): void {
    if (message === undefined) {
      message = "NO MESSAGE PROVIDED";
    }

    if (value !== true) {
      const data = {
        value: value,
        message: message,
      };

      throw `TEST-RUNNER:assert:${EncodeJson(data)}`;
    }
  }

  export function assertFalse(value: any, message: string | undefined): void {
    if (message === undefined) {
      message = "NO MESSAGE PROVIDED";
    }

    if (value !== false) {
      const data = {
        value: value,
        message: message,
      };

      throw `TEST-RUNNER:assert:${EncodeJson(data)}`;
    }
  }

  function deepEqual(actual: any, expected: any): boolean {
    if (actual === expected) {
      return true;
    }

    const actualType = DataType(actual);
    const expectedType = DataType(expected);

    if (actualType !== expectedType) {
      return false;
    }

    const actualObjectType = ObjectType(actual);
    const expectedObjectType = ObjectType(expected);

    if (actualObjectType !== expectedObjectType) {
      return false;
    }

    if (expectedObjectType === "JsArray") {
      if (ArrayCount(actual) !== ArrayCount(expected)) {
        return false;
      }

      for (let i = 0; i < expected.length; i++) {
        const expectedItem = expected[i];
        const actualItem = actual[i];

        if (!deepEqual(actualItem, expectedItem)) {
          return false;
        }
      }
    } else if (expectedObjectType === "JsObject") {
      for (const key in expected) {
        if (!actual.HasProperty(key)) {
          return false;
        }

        const expectedValue = expected[key];
        const actualValue = actual[key];

        if (!deepEqual(actualValue, expectedValue)) {
          return false;
        }
      }
    } else {
      return false;
    }

    return true;
  }
}
