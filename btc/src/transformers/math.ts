import ts from 'typescript';

function makeMathPolyfillExpression(functionName: string): ts.PropertyAccessExpression {
  return ts.factory.createPropertyAccessExpression(
    ts.factory.createPropertyAccessExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier('bt'),
        ts.factory.createIdentifier('polyfill')
      ),
      ts.factory.createIdentifier('Math')
    ),
    ts.factory.createIdentifier(functionName)
  )
}

export function mathTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (sourceFile: ts.SourceFile) => {
    const REPLACE_METHODS = ['ceil', 'floor', 'trunc', 'random'];
    const MAX_METHOD = 'max';
    const MIN_METHOD = 'min';

    function visit(node: ts.Node): ts.Node {
      node = ts.visitEachChild(node, visit, context);
      if (ts.isCallExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression)) {
          const prop = node.expression;
          if (ts.isIdentifier(prop.expression) && prop.expression.text === 'Math') {
            const methodName = prop.name.text;
            if (REPLACE_METHODS.includes(methodName)) {
              return ts.factory.createCallExpression(
                makeMathPolyfillExpression(methodName),
                undefined,
                node.arguments
              );
            } else if (methodName === MAX_METHOD) {
              return ts.factory.createCallExpression(
                ts.factory.createIdentifier(`Max`),
                undefined,
                node.arguments
              );
            } else if (methodName === MIN_METHOD) {
              return ts.factory.createCallExpression(
                ts.factory.createIdentifier(`Min`),
                undefined,
                node.arguments
              );
            }
          }
        }
      }
      return node;
    }

    return ts.visitNode(sourceFile, visit) as ts.SourceFile;
  };
}