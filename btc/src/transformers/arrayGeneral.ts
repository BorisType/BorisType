import * as ts from 'typescript';

function makeArrayPolyfillExpression(functionName: string): ts.PropertyAccessExpression {
  return ts.factory.createPropertyAccessExpression(
    ts.factory.createPropertyAccessExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier('bt'),
        ts.factory.createIdentifier('polyfill')
      ),
      ts.factory.createIdentifier('Array')
    ),
    ts.factory.createIdentifier(functionName)
  )
}

function collectArgs(expression: ts.LeftHandSideExpression, node: ts.CallExpression, count: number | undefined, restAsArray: boolean = false, visitor: ts.Visitor | undefined = undefined): ts.Expression[] {
  const args: ts.Expression[] = [expression];

  if (count !== undefined) {
    const positionalEnd = restAsArray ? count - 2 : count - 1;

    for (let i = 0; i < positionalEnd; i++) {
      args.push(node.arguments[i] || ts.factory.createIdentifier('undefined'));
    }

    if (restAsArray) {
      const restArgs = node.arguments.slice(positionalEnd);
      args.push(ts.factory.createArrayLiteralExpression(restArgs));
    }
  } else {
    args.push(...node.arguments);
  }

  if (visitor !== undefined) {
    for (let i = 0; i < args.length; i++) {
      args[i] = ts.visitNode(args[i], visitor) as ts.Expression;
    }
  }

  return args;
}

export default function arrayGeneralTransformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => (file: ts.SourceFile) => {
    const typeChecker = program.getTypeChecker();

    function visit(node: ts.Node): ts.Node {
      // Check for method calls on arrays
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const expression = node.expression.expression;
        const type = typeChecker.getTypeAtLocation(expression);

        // Check if the type is an array or array-like
        const isArrayType =
          typeChecker.typeToString(type).includes('[]') ||
          ((type.flags & ts.TypeFlags.Object) !== 0 && typeChecker.getIndexTypeOfType(type, ts.IndexKind.Number) !== undefined);

        if (isArrayType) {
          if (node.expression.name.text === 'at') {
            const args = collectArgs(expression, node, 2, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('at'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'concat') {
            const args = collectArgs(expression, node, undefined, false, visit);
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier('ArrayUnion'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'copyWithin') {
            const args = collectArgs(expression, node, 4, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('copyWithin'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'entries') {
            const args = collectArgs(expression, node, 1, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('entries'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'fill') {
            const args = collectArgs(expression, node, 4, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('fill'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'flat') {
            const args = collectArgs(expression, node, 2, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('flat'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'includes') {
            const args = collectArgs(expression, node, 3, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('includes'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'indexOf') {
            const args = collectArgs(expression, node, 3, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('indexOf'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'join') {
            const args = collectArgs(expression, node, 2, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('join'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'keys') {
            const args = collectArgs(expression, node, 1, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('keys'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'lastIndexOf') {
            const args = collectArgs(expression, node, 3, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('lastIndexOf'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'pop') {
            const args = collectArgs(expression, node, 1, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('pop'),
              undefined,
              args
            );
          }

          // if (node.expression.name.text === 'push') {
          //   const args = collectArgs(expression, node, 1);
          //   return ts.factory.createCallExpression(
          //     makeArrayPolyfillExpression('push'),
          //     undefined,
          //     args
          //   );
          // }

          if (node.expression.name.text === 'reverse') {
            const args = collectArgs(expression, node, 1, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('reverse'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'shift') {
            const args = collectArgs(expression, node, 1, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('shift'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'slice') {
            const args = collectArgs(expression, node, 3, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('slice'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'splice') {
            const args = collectArgs(expression, node, 4, true, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('splice'),
              undefined,
              args
            );
          }


          // if (node.expression.name.text === 'sort') {
          //   const args = collectArgs(expression, node, 3);
          //   return ts.factory.createCallExpression(
          //     makeArrayPolyfillExpression('sort'),
          //     undefined,
          //     args
          //   );
          // }


          if (node.expression.name.text === 'toReversed') {
            const args = collectArgs(expression, node, 1, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('toReversed'),
              undefined,
              args
            );
          }

          // if (node.expression.name.text === 'toSorted') {
          //   const args = collectArgs(expression, node, 3);
          //   return ts.factory.createCallExpression(
          //     makeArrayPolyfillExpression('toSorted'),
          //     undefined,
          //     args
          //   );
          // }

          if (node.expression.name.text === 'toSpliced') {
            const args = collectArgs(expression, node, 4, true, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('toSpliced'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'unshift') {
            const args = collectArgs(expression, node, 2, true, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('unshift'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'values') {
            const args = collectArgs(expression, node, 1, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('values'),
              undefined,
              args
            );
          }

          if (node.expression.name.text === 'with') {
            const args = collectArgs(expression, node, 3, false, visit);
            return ts.factory.createCallExpression(
              makeArrayPolyfillExpression('_with'),
              undefined,
              args
            );
          }
        }
      }

      // Check for .length property access
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') {
        const expression = node.expression;
        const type = typeChecker.getTypeAtLocation(expression);

        // Check if the type is an array or array-like
        const isArrayType =
          typeChecker.typeToString(type).includes('[]') ||
          ((type.flags & ts.TypeFlags.Object) !== 0 && typeChecker.getIndexTypeOfType(type, ts.IndexKind.Number) !== undefined);

        if (isArrayType) {
          // Replace arr.length with ArrayCount(arr)
          return ts.factory.createCallExpression(
            ts.factory.createIdentifier('ArrayCount'),
            undefined,
            [expression]
          );
        }
      }

      // Check for Array.isArray and Array.from calls
      if (ts.isCallExpression(node)) {
        const expression = node.expression;

        if (
          ts.isPropertyAccessExpression(expression) &&
          expression.name.text === 'isArray' &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === 'Array'
        ) {
          // Replace Array.isArray(value) with IsArray(value)
          return ts.factory.createCallExpression(
            ts.factory.createIdentifier('IsArray'),
            undefined,
            node.arguments
          );
        }

        if (
          ts.isPropertyAccessExpression(expression) &&
          expression.name.text === 'from' &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === 'Array'
        ) {
          // Replace Array.from(value) with ArraySelectAll(value)
          return ts.factory.createCallExpression(
            ts.factory.createIdentifier('ArraySelectAll'),
            undefined,
            node.arguments
          );
        }
      }

      // Recursively visit child nodes
      return ts.visitEachChild(node, visit, context);
    }

    const transformedFile = ts.visitNode(file, visit) as ts.SourceFile;

    return ts.factory.updateSourceFile(transformedFile, transformedFile.statements);
  };
}