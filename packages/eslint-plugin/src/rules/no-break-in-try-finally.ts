/**
 * @fileoverview Legacy compiler compatibility rule (deprecated).
 *
 * Current BorisType supports these jumps through structured completions.
 * Opt in only when targeting a compiler with the old throw-sentinel pass.
 *
 * Only flags break/continue that **targets a loop/switch outside the try block**.
 * break/continue targeting an inner loop inside try is safe.
 */

import type { Rule } from "eslint";

/** AST node types that break can target */
const BREAK_TARGETS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
]);

/** AST node types that continue can target */
const CONTINUE_TARGETS = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);

/**
 * Checks if a break/continue statement targets a construct outside the
 * innermost try block that has a finally clause.
 */
function isBreakingOutOfTryWithFinally(node: Rule.Node & { type: "BreakStatement" | "ContinueStatement" }): boolean {
  const targets = node.type === "BreakStatement" ? BREAK_TARGETS : CONTINUE_TARGETS;

  // Walk up ancestors: find the nearest target (loop/switch) and nearest try-with-finally.
  // If we hit try-with-finally before the target, that's the problematic case.
  let current: Rule.Node | null = node.parent;

  while (current) {
    // If we hit a function boundary, stop — break/continue can't cross it
    if (current.type === "FunctionDeclaration" || current.type === "FunctionExpression" || current.type === "ArrowFunctionExpression") {
      return false;
    }

    // If we hit the target loop/switch first — safe, break/continue stays inside try
    if (targets.has(current.type)) {
      return false;
    }

    // If we hit a TryStatement's block and that try has a finally — problematic
    if (current.type === "TryStatement" && (current as any).finalizer) {
      // Check that the break/continue is syntactically inside the try block (not catch/finally)
      if (isInsideTryBlock(node, current as any)) {
        return true;
      }
      // Also check if inside catch block
      if (isInsideCatchBlock(node, current as any)) {
        return true;
      }
    }

    current = current.parent;
  }

  return false;
}

/**
 * Checks if `node` is a descendant of the `try` block (not catch/finally) of `tryStmt`.
 */
function isInsideTryBlock(node: Rule.Node, tryStmt: any): boolean {
  const tryBlock = tryStmt.block;
  return isDescendantOf(node, tryBlock);
}

/**
 * Checks if `node` is a descendant of the `catch` block of `tryStmt`.
 */
function isInsideCatchBlock(node: Rule.Node, tryStmt: any): boolean {
  const handler = tryStmt.handler;
  if (!handler) return false;
  return isDescendantOf(node, handler);
}

/**
 * Checks if `node` is a descendant of `ancestor`.
 */
function isDescendantOf(node: Rule.Node, ancestor: Rule.Node): boolean {
  let current: Rule.Node | null = node.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    deprecated: true,
    docs: {
      description: "Legacy compiler compatibility: jumps crossing finally",
      recommended: false,
      url: "https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-break-in-try-finally.md",
    },
    schema: [],
    messages: {
      noBreakInTryFinally:
        "Legacy BorisType compilers may skip finally when break exits try/catch. " +
        "Extract the loop or move the break outside try-finally.",
      noContinueInTryFinally:
        "Legacy BorisType compilers may skip finally when continue exits try/catch. " +
        "Extract the loop or move the continue outside try-finally.",
    },
  },

  create(context) {
    return {
      BreakStatement(node) {
        if (isBreakingOutOfTryWithFinally(node as any)) {
          context.report({ node, messageId: "noBreakInTryFinally" });
        }
      },

      ContinueStatement(node) {
        if (isBreakingOutOfTryWithFinally(node as any)) {
          context.report({ node, messageId: "noContinueInTryFinally" });
        }
      },
    };
  },
};

export default rule;
