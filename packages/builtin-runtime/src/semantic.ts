export namespace bt {
  type BtDescriptor = {
    "@descriptor": string;
  };

  type FuncDescriptor = BtDescriptor & {
    "@descriptor": "function";
    obj: any;
    env: any;
    callable?: any;
    lib?: any;
    ref?: string;
  };

  /**
   * Создаёт копию дескриптора функции с привязкой к указанному объекту.
   * Используется для биндинга методов из прототипа к реальному экземпляру (Variant A — без кеша).
   *
   * @param descriptor - исходный дескриптор функции из прототипа
   * @param targetObject - объект, к которому нужно привязать метод (будет доступен как `__this`)
   * @returns новый дескриптор с `obj` === targetObject
   */
  function bindMethodToObject(descriptor: any, targetObject: any): any {
    const newDesc = { "@descriptor": "function" } as any;

    newDesc.SetProperty("obj", targetObject);
    newDesc.SetProperty("env", descriptor.env);

    if (descriptor.HasProperty("callable")) {
      newDesc.SetProperty("callable", descriptor.callable);
    }
    if (descriptor.HasProperty("lib")) {
      newDesc.SetProperty("lib", descriptor.lib);
    }
    if (descriptor.HasProperty("ref")) {
      newDesc.SetProperty("ref", descriptor.ref);
    }

    return newDesc;
  }

  /**
   * Проверяет, является ли значение дескриптором функции (JsObject с "@descriptor" === "function").
   */
  function isFuncDescriptor(value: any): boolean {
    const objectType = ObjectType(value);
    return (
      objectType === "JsObject" &&
      value.HasProperty("@descriptor") &&
      value.GetProperty("@descriptor") === "function"
    );
  }

  /**
   * Ищет свойство в цепочке прототипов объекта (через поле `__proto`).
   * Если свойство найдено и является дескриптором функции — возвращает копию с привязкой к `object`.
   * Если свойство найдено и является обычным значением — возвращает как есть.
   *
   * @param object - исходный объект, на котором ищем свойство (для привязки методов)
   * @param propertyName - имя искомого свойства
   * @returns найденное значение (с привязкой для методов) или undefined
   */
  function lookupPrototypeChain(object: any, propertyName: string | number): any {
    var current = GetOptObjectProperty(object, "__proto");

    while (current !== undefined) {
      const protoValue = GetOptObjectProperty(current, propertyName);

      if (protoValue !== undefined) {
        const protoValueType = ObjectType(protoValue);

        // Сырая функция — возвращаем как есть
        if (protoValueType === "JsFuncObject") {
          return protoValue;
        }

        // Дескриптор функции — биндим к реальному объекту
        if (isFuncDescriptor(protoValue)) {
          return bindMethodToObject(protoValue, object);
        }

        // Обычное значение — просто возвращаем
        return protoValue;
      }

      // Идём дальше по цепочке
      current = GetOptObjectProperty(current, "__proto");
    }

    return undefined;
  }

  export function getProperty(object: any, propertyName: string | number) {
    const dataType = DataType(object);

    if (dataType === "undefined") {
      throw `TypeError: Cannot read properties of undefined (reading '${propertyName}')`;
    }

    if (dataType === "null") {
      throw `TypeError: Cannot read properties of null (reading '${propertyName}')`;
    }

    if (dataType === "object") {
      const objectTypeOfObject = ObjectType(object);
      if (objectTypeOfObject === "JsArray" && DataType(propertyName) === "integer") {
        if ((propertyName as number) < 0 || (propertyName as number) >= ArrayCount(object)) {
          return undefined;
        } else {
          return object[propertyName as number];
        }
      }

      const returnValue = GetOptObjectProperty(object, propertyName);
      const objectTypeOfReturnValue = ObjectType(returnValue);

      // Обработка сырых свойств-функций в объектах
      if (objectTypeOfReturnValue === "JsFuncObject") {
        return returnValue;
      }

      // Обработка оберток методов в объектах
      if (
        objectTypeOfReturnValue === "JsObject" &&
        returnValue.HasProperty("@descriptor") &&
        returnValue.GetProperty("@descriptor") === "function"
      ) {
        // Если у дескриптора уже есть поле "obj", значит это полноценный FuncDescriptor, который мы можем вернуть как есть
        if (returnValue.HasProperty("obj") && returnValue.GetProperty("obj") !== undefined) {
          return returnValue;
        }

        // Привязываем метод к объекту (bind Variant A — копия дескриптора)
        return bindMethodToObject(returnValue, object);
      }

      // Поиск по цепочке прототипов через __proto
      if (returnValue === undefined && objectTypeOfObject === "JsObject") {
        const protoResult = lookupPrototypeChain(object, propertyName);
        if (protoResult !== undefined) {
          return protoResult;
        }
      }

      // Fallback для получения built-in методов объектов
      if (returnValue === undefined) {
        // Обработка встроенных методов объектов JsObject
        if (objectTypeOfObject === "JsObject") {
          var knownObjectMethods = [
            "HasProperty",
            "AddProperty",
            "GetOptProperty",
            "GetProperty",
            "SetProperty",
          ];
          if (ArrayOptFind(knownObjectMethods, "This === propertyName") !== undefined) {
            return {
              "@descriptor": "function",
              obj: object,
              env: undefined,
              ref: propertyName,
            } as FuncDescriptor;
          }
        }

        // Обработка встроенных методов объектов JsArray
        if (objectTypeOfObject === "JsArray") {
          var knownObjectMethods = ["push"];
          if (ArrayOptFind(knownObjectMethods, "This === propertyName") !== undefined) {
            return {
              "@descriptor": "function",
              obj: object,
              env: undefined,
              ref: propertyName,
            };
          }
        }

        // Обработка встроенных методов объектов DxTrans
        if (objectTypeOfObject === "DxTrans") {
          var knownObjectMethods = [
            "AddRespHeader",
            "CheckLdsAuth",
            "Execute",
            "GetSessionByID",
            "HandleNotFound",
            "PermanentRedirect",
            "Redirect",
            "SetRespStatus",
            "SetWrongAuth",
            "UpgradeToWebSocket",
          ];
          if (ArrayOptFind(knownObjectMethods, "This === propertyName") !== undefined) {
            return {
              "@descriptor": "function",
              obj: object,
              env: undefined,
              ref: propertyName,
            };
          }
        }

        // Обработка встроенных методов объектов BmObject и JsCodeLibrary
        if (
          objectTypeOfObject === "BmObject" ||
          objectTypeOfObject === "JsCodeLibrary" ||
          objectTypeOfObject === "JsCodeThread"
        ) {
          // Мы никак не можем проверить наличие метода в BmObject, поэтому просто ожидаем, что любой запрошенный метод там существует
          // в надежде что TypeScript при компиляции проверит корректность вызова метода благодоря типизации.
          return {
            "@descriptor": "function",
            obj: object,
            env: undefined,
            ref: propertyName,
          };
        }
      }

      return returnValue;
    }

    if (dataType === "string") {
      if (propertyName === "length") {
        return StrCharCount(object);
      }

      var knownObjectMethods = [
        "Allocate",
        "charAt",
        "charCodeAt",
        "fromCharCode",
        "indexOf",
        "lastIndexOf",
        "slice",
        "split",
        "substr",
        "toLowerCase",
        "ToWinLineBreaks",
      ];
      if (ArrayOptFind(knownObjectMethods, "This === propertyName") !== undefined) {
        return {
          "@descriptor": "function",
          obj: object,
          env: undefined,
          ref: propertyName,
        };
      }
    }

    throw `TypeError: Cannot read properties of ${dataType} (reading '${propertyName}')`;
  }

  export function setProperty(object: any, propertyName: string, value: any) {
    const dataTypeOfObject = DataType(object);

    if (dataTypeOfObject === "undefined") {
      throw `TypeError: Cannot set properties of undefined (setting '${propertyName}')`;
    }

    if (dataTypeOfObject === "null") {
      throw `TypeError: Cannot set properties of null (setting '${propertyName}')`;
    }

    if (dataTypeOfObject === "object") {
      // const objectTypeOfObject = ObjectType(object);

      SetObjectProperty(object, propertyName, value);
      return;
    }

    throw `TypeError: Cannot set properties of ${dataTypeOfObject} (setting '${propertyName}')`;
  }

  export function isFunction(object: any): boolean {
    const objectType = ObjectType(object);
    return (
      objectType === "JsFuncObject" ||
      (objectType === "JsObject" &&
        object.HasProperty("@descriptor") &&
        object.GetProperty("@descriptor") === "function")
    );
  }

  export function callFunction(func: any, args: any[]) {
    const funcObjectType = ObjectType(func);

    if (funcObjectType === "JsFuncObject") {
      const argsCount = ArrayCount(args);

      if (argsCount === 0) {
        return func();
      } else if (argsCount === 1) {
        return func(args[0]);
      } else if (argsCount === 2) {
        return func(args[0], args[1]);
      } else if (argsCount === 3) {
        return func(args[0], args[1], args[2]);
      } else if (argsCount === 4) {
        return func(args[0], args[1], args[2], args[3]);
      } else if (argsCount === 5) {
        return func(args[0], args[1], args[2], args[3], args[4]);
      }

      // legacy-way
      const argsEval1 = collectArgsToEval("args", args.length);

      return eval(`func(${argsEval1})`);
    } else if (
      funcObjectType === "JsObject" &&
      func.HasProperty("@descriptor") &&
      func.GetProperty("@descriptor") === "function"
    ) {
      // new-way

      if (func.HasProperty("callable")) {
        // script function
        const env2 = (func as FuncDescriptor).env;
        const obj2 = (func as FuncDescriptor).obj;
        const callable2 = (func as FuncDescriptor).callable;

        // return eval(`callable2(env2, obj2, args)`);
        return callable2(env2, obj2, args);
      } else if (func.HasProperty("lib")) {
        // module function
        const env3 = (func as FuncDescriptor).env;
        const obj3 = (func as FuncDescriptor).obj;
        const lib3 = (func as FuncDescriptor).lib;
        const ref3 = (func as FuncDescriptor).ref!;

        // return eval(`lib3.${ref3}(env3, obj3, args)`);
        return CallObjectMethod(lib3, ref3, [env3, obj3, args]);
      } else {
        // standard object method - ?
        const obj4 = (func as FuncDescriptor).obj;
        const ref4 = (func as FuncDescriptor).ref!;

        // return eval(`obj4.${ref4}(${argsEval4})`);
        return CallObjectMethod(obj4, ref4, args);
      }
    } else {
      throw "TypeError: callable is not a function";
    }
  }

  /**
   * Вызывает функцию-дескриптор с подменённым `__this`.
   *
   * Используется для реализации `super(args)` и `super.method(args)`:
   * нужно вызвать родительскую функцию, но с `__this` текущего экземпляра.
   *
   * @param func - дескриптор функции (с callable/lib+ref)
   * @param thisArg - объект, который будет передан как `__this`
   * @param args - аргументы вызова
   * @returns результат вызова функции
   */
  export function callWithThis(func: any, thisArg: any, args: any[]) {
    const funcObjectType = ObjectType(func);

    if (
      funcObjectType === "JsObject" &&
      func.HasProperty("@descriptor") &&
      func.GetProperty("@descriptor") === "function"
    ) {
      if (func.HasProperty("callable")) {
        const env = (func as FuncDescriptor).env;
        const callable = (func as FuncDescriptor).callable;
        return callable(env, thisArg, args);
      } else if (func.HasProperty("lib")) {
        const env = (func as FuncDescriptor).env;
        const lib = (func as FuncDescriptor).lib;
        const ref = (func as FuncDescriptor).ref!;
        return CallObjectMethod(lib, ref, [env, thisArg, args]);
      }
    }

    throw "TypeError: callWithThis: argument is not a function descriptor";
  }

  /**
   * Создаёт экземпляр класса: формирует объект с `__proto`, вызывает конструктор.
   *
   * Ожидает дескриптор конструктора с дополнительным полем `proto`,
   * содержащим объект-прототип класса.
   *
   * @param ctorDesc - дескриптор конструктора (должен содержать callable, env, proto)
   * @param args - аргументы конструктора
   * @returns созданный экземпляр с установленным `__proto`
   */
  export function createInstance(ctorDesc: any, args: any[]): any {
    const proto = GetOptObjectProperty(ctorDesc, "proto"); // проверяем наличие proto

    if (proto === undefined) {
      // Fallback для случаев, когда сюда попадают нативные конструкторы BS
      // Аргументы игнорируются пока что
      return new ctorDesc();
    }

    const instance = { __proto: proto } as any;

    // Вызываем конструктор с instance как __this
    if (ctorDesc.HasProperty("callable")) {
      const env = (ctorDesc as FuncDescriptor).env;
      const callable = (ctorDesc as FuncDescriptor).callable;
      callable(env, instance, args);
    } else if (ctorDesc.HasProperty("lib")) {
      const env = (ctorDesc as FuncDescriptor).env;
      const lib = (ctorDesc as FuncDescriptor).lib;
      const ref = (ctorDesc as FuncDescriptor).ref!;
      CallObjectMethod(lib, ref, [env, instance, args]);
    }

    return instance;
  }

  function collectArgsToEval(name: string, count: number): string {
    const args = [];

    for (let i = 0; i < count; i++) {
      args.push(name + "[" + i + "]");
    }

    return ArrayMerge(args, "This", ", ");
  }
}
