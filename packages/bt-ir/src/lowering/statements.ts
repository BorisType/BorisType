/**
 * Statement Visitors  barrel re-export
 *
 * Код разбит на модули в директории statements/:
 * - dispatch.ts      visitStatement (main dispatch)
 * - control-flow.ts  visitIfStatement, visitSwitchStatement, visitTryStatement + desugaring
 * - loops.ts         visitForStatement, visitForInStatement, visitForOfStatement, visitWhile, visitDoWhile
 * - blocks.ts        visitBlock, visitStatementList, visitStatementAsBlock, visitReturnStatement
 *
 * @module lowering/statements
 */

export {
  visitStatement,
  visitReturnStatement,
  visitBlock,
  visitStatementList,
  visitStatementAsBlock,
  visitIfStatement,
  visitSwitchStatement,
  visitTryStatement,
  visitForStatement,
  visitForInStatement,
  visitForOfStatement,
  visitWhileStatement,
  visitDoWhileStatement,
} from "./statements/index.ts";
