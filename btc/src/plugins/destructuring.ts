import { PluginObj, PluginPass, types as t } from '@babel/core';
import { Expression } from '@babel/types';

interface DestructuringState extends PluginPass {
}

function makeDestructuringPolyfillExpression(functionName: string) {
  return t.memberExpression(
    t.memberExpression(
      t.memberExpression(
        t.identifier('bt'),
        t.identifier('polyfill')
      ),
      t.identifier('destructuring')
    ),
    t.identifier(functionName)
  );
}

export default function replaceDestructuringPlugin(): PluginObj<DestructuringState> {
  return {
    name: 'replace-destructuring',
    visitor: {
      VariableDeclaration(path, state) {
        const declarations = path.node.declarations;
        const newDeclarations: t.VariableDeclaration[] = [];

        // Process each variable declarator
        declarations.forEach((declarator) => {
          // Handle object destructuring
          if (t.isObjectPattern(declarator.id)) {
            const properties = declarator.id.properties;
            const init = declarator.init;
            const excludedKeys: t.StringLiteral[] = [];

            // Collect excluded keys and handle regular properties
            properties.forEach((prop) => {
              if (t.isObjectProperty(prop)) {
                const key = prop.key;
                const value = prop.value;

                if (t.isIdentifier(key) && t.isIdentifier(value)) {
                  // Create new declaration: const key1 = testObject1.key1
                  const newDeclarator = t.variableDeclarator(
                    t.identifier(value.name),
                    t.memberExpression(init as Expression, key)
                  );
                  newDeclarations.push(
                    t.variableDeclaration(path.node.kind, [newDeclarator])
                  );
                  // Collect key for exclusion
                  excludedKeys.push(t.stringLiteral(key.name));
                }
              } else if (t.isRestElement(prop)) {
                state.needsObjectRest = true;
                // Handle rest element (...restKeys)
                const restIdent = prop.argument;
                if (t.isIdentifier(restIdent)) {
                  const restCall = t.callExpression(
                    makeDestructuringPolyfillExpression("object_rest"),
                    [init as Expression, t.arrayExpression(excludedKeys)]
                  );

                  const newDeclarator = t.variableDeclarator(restIdent, restCall);
                  newDeclarations.push(
                    t.variableDeclaration(path.node.kind, [newDeclarator])
                  );
                }
              }
            });
          }
          // Handle array destructuring
          else if (t.isArrayPattern(declarator.id)) {
            const elements = declarator.id.elements;
            const init = declarator.init;
            // Generate unique auxiliary variable name
            const auxVarName = path.scope.generateUidIdentifier('arr');

            // Create auxiliary variable: const _arr = ArrayDirect(testArray1)
            const auxDeclarator = t.variableDeclarator(
              auxVarName,
              t.callExpression(t.identifier('ArrayDirect'), [init as Expression])
            );
            newDeclarations.push(t.variableDeclaration(path.node.kind, [auxDeclarator]));

            // Process array elements
            elements.forEach((element, index) => {
              if (t.isIdentifier(element)) {
                // Create new declaration: const elem1 = _arr[0]
                const newDeclarator = t.variableDeclarator(
                  element,
                  t.memberExpression(auxVarName, t.numericLiteral(index), true)
                );
                newDeclarations.push(
                  t.variableDeclaration(path.node.kind, [newDeclarator])
                );
              } else if (t.isRestElement(element)) {
                state.needsArrayRest = true;
                // Handle rest element (...restElems)
                const restIdent = element.argument;
                if (t.isIdentifier(restIdent)) {
                  const restCall = t.callExpression(
                    makeDestructuringPolyfillExpression("array_rest"),
                    [auxVarName, t.numericLiteral(index)]
                  );

                  const newDeclarator = t.variableDeclarator(restIdent, restCall);
                  newDeclarations.push(
                    t.variableDeclaration(path.node.kind, [newDeclarator])
                  );
                }
              }
            });
          }
        });

        // Replace original declaration with new ones if any were created
        if (newDeclarations.length > 0) {
          path.replaceWithMultiple(newDeclarations);
        }
      },
    },
  };
}