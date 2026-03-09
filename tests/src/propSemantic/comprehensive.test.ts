// Comprehensive optional chaining test with method calls
function ff() {
  return {
    prop: 2,
  };
}

const obj2: any = {
  func: ff,
};

// Direct method call
ff();

// Direct method call on object
const v1 = obj2.func();
const v2 = obj2.func()?.prop;

// Direct method call on optional object
const v3 = obj2?.func();
const v4 = obj2?.func()?.prop;

// Optional method call on optional object
const v5 = obj2?.func?.();
const v6 = obj2?.func?.()?.prop;

botest.assertOk();

export {};
