import * as ts from 'typescript';

export default function stringTransformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => (file: ts.SourceFile) => {
    const typeChecker = program.getTypeChecker();

    function visit(node: ts.Node): ts.Node {
      // Проверяем обращения к свойству .length
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') {
        const expression = node.expression;
        const type = typeChecker.getTypeAtLocation(expression);

        // Проверяем, является ли тип строкой или строковым литералом
        const isStringType =
          typeChecker.typeToString(type) === 'string' ||
          (type.isStringLiteral && type.isStringLiteral()) ||
          (type.flags & ts.TypeFlags.StringLike) !== 0;

        if (isStringType) {
          // Заменяем str.length на StrCharCount(str)
          return ts.factory.createCallExpression(
            ts.factory.createIdentifier('StrCharCount'),
            undefined,
            [expression]
          );
        }
      }

      // Проверяем вызовы методов toUpperCase, toLowerCase, startsWith и endsWith
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isPropertyAccessExpression(expression)) {
          const methodName = expression.name.text;
          const target = expression.expression;
          const type = typeChecker.getTypeAtLocation(target);

          // Проверяем, является ли тип строкой или строковым литералом
          const isStringType =
            typeChecker.typeToString(type) === 'string' ||
            (type.isStringLiteral && type.isStringLiteral()) ||
            (type.flags & ts.TypeFlags.StringLike) !== 0;

          if (isStringType) {
            // Обработка toUpperCase и toLowerCase
            if (methodName === 'toUpperCase' || methodName === 'toLowerCase') {
              const functionName = methodName === 'toUpperCase' ? 'StrUpperCase' : 'StrLowerCase';
              return ts.factory.createCallExpression(
                ts.factory.createIdentifier(functionName),
                undefined,
                [target]
              );
            }

            // Обработка trim
            if (methodName === 'trim') {
              return ts.factory.createCallExpression(
                ts.factory.createIdentifier('Trim'),
                undefined,
                [target]
              );
            }

            // Обработка startsWith
            if (methodName === 'startsWith' && node.arguments.length > 0) {
              const searchString = node.arguments[0];
              const position = node.arguments[1];

              if (position) {
                // Если передан position, заменяем на StrBegins(StrCharRangePos(str, position, StrCharCount(str)), searchString)
                const charRangePosCall = ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrCharRangePos'),
                  undefined,
                  [
                    target,
                    position,
                    ts.factory.createCallExpression(
                      ts.factory.createIdentifier('StrCharCount'),
                      undefined,
                      [target]
                    )
                  ]
                );
                return ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrBegins'),
                  undefined,
                  [charRangePosCall, searchString]
                );
              } else {
                // Если position не передан, заменяем на StrBegins(str, searchString)
                return ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrBegins'),
                  undefined,
                  [target, searchString]
                );
              }
            }

            // Обработка includes
            if (methodName === 'includes' && node.arguments.length > 0) {
              const searchString = node.arguments[0];
              const position = node.arguments[1];

              if (position) {
                // Если передан position, заменяем на StrContains(StrCharRangePos(str, position, StrCharCount(str)), searchString)
                const charRangePosCall = ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrCharRangePos'),
                  undefined,
                  [
                    target,
                    position,
                    ts.factory.createCallExpression(
                      ts.factory.createIdentifier('StrCharCount'),
                      undefined,
                      [target]
                    )
                  ]
                );
                return ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrContains'),
                  undefined,
                  [charRangePosCall, searchString]
                );
              } else {
                // Если position не передан, заменяем на StrContains(str, searchString)
                return ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrContains'),
                  undefined,
                  [target, searchString]
                );
              }
            }

            // Обработка endsWith
            if (methodName === 'endsWith' && node.arguments.length > 0) {
              const searchString = node.arguments[0];
              const length = node.arguments[1];

              if (length) {
                // Если передан length, заменяем на StrEnds(StrCharRangePos(str, 0, length), searchString)
                const charRangePosCall = ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrCharRangePos'),
                  undefined,
                  [
                    target,
                    ts.factory.createNumericLiteral('0'),
                    length
                  ]
                );
                return ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrEnds'),
                  undefined,
                  [charRangePosCall, searchString]
                );
              } else {
                // Если length не передан, заменяем на StrEnds(str, searchString)
                return ts.factory.createCallExpression(
                  ts.factory.createIdentifier('StrEnds'),
                  undefined,
                  [target, searchString]
                );
              }
            }
          }
        }
      }

      // Рекурсивно обходим дочерние узлы
      return ts.visitEachChild(node, visit, context);
    }

    return ts.visitNode(file, visit) as ts.SourceFile;
  };
}