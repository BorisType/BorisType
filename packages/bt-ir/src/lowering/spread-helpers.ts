/**
 * Вспомогательные функции для spread-преобразований
 *
 * @module lowering/spread-helpers
 */

import { IR, type IRFunctionDeclaration, type IRStatement } from "../ir/index.ts";

/**
 * Создаёт IR для функции ObjectUnion (для spread в объектах).
 * BorisScript использует SetProperty/GetProperty для копирования свойств.
 */
export function createObjectUnionFunction(): IRFunctionDeclaration {
  const body: IRStatement[] = [
    IR.varDecl("newObject", IR.object([])),
    IR.varDecl("key", null),
    IR.forIn(
      IR.id("key"),
      IR.id("obj1"),
      IR.block([
        IR.exprStmt(
          IR.call(IR.dot(IR.id("newObject"), "SetProperty"), [
            IR.id("key"),
            IR.call(IR.dot(IR.id("obj1"), "GetProperty"), [IR.id("key")]),
          ]),
        ),
      ]),
    ),
    IR.forIn(
      IR.id("key"),
      IR.id("obj2"),
      IR.block([
        IR.exprStmt(
          IR.call(IR.dot(IR.id("newObject"), "SetProperty"), [
            IR.id("key"),
            IR.call(IR.dot(IR.id("obj2"), "GetProperty"), [IR.id("key")]),
          ]),
        ),
      ]),
    ),
    IR.return(IR.id("newObject")),
  ];

  return IR.functionDecl(
    "ObjectUnion",
    [IR.param("obj1"), IR.param("obj2")],
    body,
    undefined,
    true, // plainSignature
  );
}
