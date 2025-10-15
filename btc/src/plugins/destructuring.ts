import { PluginObj, PluginPass, types as t } from '@babel/core';
import template from '@babel/template';
import { Expression } from '@babel/types';
import path from 'path';
import fs from 'fs';

interface DestructuringState extends PluginPass {
  // Empty interface for potential future extensions
}

export default function replaceDestructuringPlugin(): PluginObj<DestructuringState> {
  return {
    name: 'replace-destructuring',
    pre() {
      const staticFilePath = 'destructuring.js';
      this.staticCode = fs.readFileSync(path.resolve(__dirname, '..', '..', 'resources', staticFilePath), 'utf-8');
    },
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
                // Handle rest element (...restKeys)
                const restIdent = prop.argument;
                if (t.isIdentifier(restIdent)) {
                  // Create ___btp_object_rest call with excluded keys
                  const restCall = t.callExpression(t.identifier('___btp_object_rest'), [
                    init as Expression,
                    t.arrayExpression(excludedKeys)
                  ]);
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
                // Handle rest element (...restElems)
                const restIdent = element.argument;
                if (t.isIdentifier(restIdent)) {
                  // Create ___btp_array_rest call: const restElems = ___btp_array_rest(_arr, index)
                  const restCall = t.callExpression(
                    t.identifier('___btp_array_rest'),
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
      // Add static code (presumably containing ___btp_object_rest and ___btp_array_rest) to the program scope
      Program(path) {
        const ast = template.ast(this.staticCode as string);
        const statements = Array.isArray(ast) ? ast : [ast];
        path.node.body.unshift(...statements);
      },
    },
  };
}