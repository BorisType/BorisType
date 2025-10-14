// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring

import { PluginObj, PluginPass, types as t } from '@babel/core';
import { Expression } from '@babel/types';

interface DestructuringState extends PluginPass {
  // Empty interface for potential future extensions
}

export default function replaceDestructuringPlugin(): PluginObj<DestructuringState> {
  return {
    name: 'replace-destructuring',
    visitor: {
      // Handle VariableDeclaration nodes (const, let, var)
      VariableDeclaration(path) {
        const declarations = path.node.declarations;
        const newDeclarations: t.VariableDeclaration[] = [];

        // Process each variable declarator
        declarations.forEach((declarator) => {
          // Handle object destructuring
          if (t.isObjectPattern(declarator.id)) {
            const properties = declarator.id.properties;
            const init = declarator.init;

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
                }
              } else if (t.isRestElement(prop)) {
                // Handle rest element (...restKeys)
                const restIdent = prop.argument;
                if (t.isIdentifier(restIdent)) {
                  // Create throw function call for rest element
                  const throwCall = t.callExpression(t.identifier('throwNotSupported'), [
                    t.stringLiteral('Rest object destructuring not supported yet'),
                  ]);
                  const newDeclarator = t.variableDeclarator(restIdent, throwCall);
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
                // Handle rest element (...restElems)
                const restIdent = element.argument;
                if (t.isIdentifier(restIdent)) {
                  // Create throw function call for rest element
                  const throwCall = t.callExpression(t.identifier('throwNotSupported'), [
                    t.stringLiteral('Rest array destructuring not supported yet'),
                  ]);
                  const newDeclarator = t.variableDeclarator(restIdent, throwCall);
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
      // Add throwNotSupported function to the program scope
      Program(path) {
        const throwFunction = t.functionDeclaration(
          t.identifier('throwNotSupported'),
          [t.identifier('message')],
          t.blockStatement([
            t.throwStatement(t.newExpression(t.identifier('Error'), [t.identifier('message')])),
          ])
        );
        path.node.body.unshift(throwFunction);
      },
    },
  };
}