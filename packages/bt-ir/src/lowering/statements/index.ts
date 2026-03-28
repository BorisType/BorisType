/**
 * Statement Visitors — barrel re-exports
 *
 * @module lowering/statements
 */

// Dispatcher
export { visitStatement } from "./dispatch.ts";

// Block & statement list helpers
export { visitReturnStatement, visitBlock, visitStatementList, visitStatementAsBlock } from "./blocks.ts";

// Declarations
export { visitFunctionDeclaration, visitVariableStatement } from "./declarations.ts";

// Control flow
export { visitIfStatement, visitSwitchStatement, visitTryStatement } from "./control-flow.ts";

// Loops
export { visitForStatement, visitForInStatement, visitForOfStatement, visitWhileStatement, visitDoWhileStatement } from "./loops.ts";
