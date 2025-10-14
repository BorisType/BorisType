import { PluginObj, PluginPass, types as t } from '@babel/core';

interface LoopState extends PluginPass {
  loopVariables: Map<string, { kind: string; newName: string }>; // Maps original name to kind and new unique name
  isInLoop: boolean;
  loopCounter: number; // Tracks top-level loop sessions
}

const isLoop = (node: t.Node): node is t.ForStatement | t.ForInStatement | t.ForOfStatement | t.WhileStatement | t.DoWhileStatement => {
  return (
    t.isForStatement(node) ||
    t.isForInStatement(node) ||
    t.isForOfStatement(node) ||
    t.isWhileStatement(node) ||
    t.isDoWhileStatement(node)
  );
};

// Initialize loop state for a top-level loop
function enterLoop(state: LoopState) {
  if (!state.isInLoop) {
    state.isInLoop = true;
    state.loopVariables = new Map<string, { kind: string; newName: string }>();
    state.loopCounter = (state.loopCounter || 0) + 1; // Increment loop counter
  }
}

// Collect variables from ForIn/ForOf loop headers and replace declarations
function collectLoopHeaderVariables(path: any, state: LoopState) {
  if (t.isVariableDeclaration(path.node.left)) {
    const kind = path.node.left.kind;
    path.node.left.declarations.forEach((decl: t.VariableDeclarator) => {
      if (t.isIdentifier(decl.id)) {
        const newName = `${decl.id.name}_loop${state.loopCounter}`;
        state.loopVariables.set(decl.id.name, { kind, newName });
        // Rename references in the scope
        path.scope.rename(decl.id.name, newName);
      } else if (t.isObjectPattern(decl.id) || t.isArrayPattern(decl.id)) {
        const identifiers = t.getBindingIdentifiers(decl.id);
        Object.keys(identifiers).forEach((name) => {
          const newName = `${name}_loop${state.loopCounter}`;
          state.loopVariables.set(name, { kind, newName });
          path.scope.rename(name, newName);
        });
      }
    });
    // Replace VariableDeclaration with just the identifier or pattern
    path.node.left = path.node.left.declarations[0].id;
  }
}

// Handle loop exit: log variables, insert declarations, reset state
function exitLoop(path: any, state: LoopState) {
  if (!path.findParent((p: any) => isLoop(p.node))) {
    // Log collected variables
    // console.log(
    //   'Variables declared in loop:',
    //   Array.from(state.loopVariables.entries()).map(([name, { kind, newName }]) => [name, kind, newName])
    // );

    // Create variable declarations with empty initialization
    const declarations: t.VariableDeclaration[] = [];
    state.loopVariables.forEach(({ kind, newName }) => {
      const init = kind === 'const' ? t.nullLiteral() : t.identifier('undefined');
      const declarator = t.variableDeclarator(t.identifier(newName), init);
      declarations.push(t.variableDeclaration(kind as 'const' | 'let' | 'var', [declarator]));
    });

    // Insert declarations before the top-level loop
    if (declarations.length > 0) {
      const parent = path.getStatementParent();
      if (parent) {
        parent.insertBefore(declarations);
      }
    }

    // Reset state
    state.isInLoop = false;
    state.loopVariables = new Map<string, { kind: string; newName: string }>();
  }
}

export default function collectLoopVariablesPlugin(): PluginObj<LoopState> {
  return {
    name: 'collect-loop-variables',
    pre() {
      this.loopVariables = new Map<string, { kind: string; newName: string }>();
      this.isInLoop = false;
      this.loopCounter = 0;
    },
    visitor: {
      ForStatement: {
        enter(path, state) {
          enterLoop(state);
        },
        exit(path, state) {
          exitLoop(path, state);
        },
      },
      ForInStatement: {
        enter(path, state) {
          enterLoop(state);
          collectLoopHeaderVariables(path, state);
        },
        exit(path, state) {
          exitLoop(path, state);
        },
      },
      ForOfStatement: {
        enter(path, state) {
          enterLoop(state);
          collectLoopHeaderVariables(path, state);
        },
        exit(path, state) {
          exitLoop(path, state);
        },
      },
      WhileStatement: {
        enter(path, state) {
          enterLoop(state);
        },
        exit(path, state) {
          exitLoop(path, state);
        },
      },
      DoWhileStatement: {
        enter(path, state) {
          enterLoop(state);
        },
        exit(path, state) {
          exitLoop(path, state);
        },
      },
      VariableDeclaration(path, state) {
        if (state.isInLoop) {
          const kind = path.node.kind; // 'const', 'let', or 'var'
          const assignments: t.ExpressionStatement[] = [];
          path.node.declarations.forEach((decl) => {
            if (t.isIdentifier(decl.id)) {
              const newName = `${decl.id.name}_loop${state.loopCounter}`;
              state.loopVariables.set(decl.id.name, { kind, newName });
              // Rename references in the scope
              path.scope.rename(decl.id.name, newName);
              // Create assignment expression (e.g., x_loopN = 5 or x_loopN = undefined)
              const init = decl.init || t.identifier('undefined');
              assignments.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(newName), init)));
            } else if (t.isObjectPattern(decl.id) || t.isArrayPattern(decl.id)) {
              // Handle destructuring
              const identifiers = t.getBindingIdentifiers(decl.id);
              Object.keys(identifiers).forEach((name) => {
                const newName = `${name}_loop${state.loopCounter}`;
                state.loopVariables.set(name, { kind, newName });
                path.scope.rename(name, newName);
                // Create individual assignments for each identifier
                const init = decl.init || t.identifier('undefined');
                assignments.push(
                  t.expressionStatement(t.assignmentExpression('=', t.identifier(newName), init))
                );
              });
            }
          });
          // Replace VariableDeclaration with assignments
          if (assignments.length > 0) {
            path.replaceWithMultiple(assignments);
          } else {
            path.remove(); // Remove empty declarations
          }
        }
      },
    },
  };
}