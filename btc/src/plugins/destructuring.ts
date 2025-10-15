import { PluginObj, PluginPass, types as t } from '@babel/core';
import { parse } from '@babel/parser';
import { Expression } from '@babel/types';
import path from 'path';
import fs from 'fs';

interface DestructuringState extends PluginPass {
  staticCode?: string;
  helpers?: Map<string, t.FunctionDeclaration>;
  needsObjectRest?: boolean;
  needsArrayRest?: boolean;
}

export default function replaceDestructuringPlugin(): PluginObj<DestructuringState> {
  return {
    name: 'replace-destructuring',
    pre() {
      const staticFilePath = 'destructuring.js';
      this.staticCode = fs.readFileSync(path.resolve(__dirname, '..', '..', 'resources', staticFilePath), 'utf-8');
      
      const staticAst = parse(this.staticCode, { sourceType: 'script' });
      this.helpers = new Map();
      staticAst.program.body.forEach((node) => {
        if (t.isFunctionDeclaration(node)) {
          this.helpers!.set(node.id!.name, node);
        }
      });

      this.needsObjectRest = false;
      this.needsArrayRest = false;
    },
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
                state.needsArrayRest = true;
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
      Program: {
        exit(path, state) {
          const toInsert: t.Statement[] = [];

          if (state.needsObjectRest) {
            const objectRestFunc = state.helpers?.get('___btp_object_rest');
            if (objectRestFunc) toInsert.push(objectRestFunc);
          }

          if (state.needsArrayRest) {
            const arrayRestFunc = state.helpers?.get('___btp_array_rest');
            if (arrayRestFunc) toInsert.push(arrayRestFunc);
          }

          if (toInsert.length > 0) {
            path.node.body.unshift(...toInsert);
          }
        },
      },
    },
  };
}