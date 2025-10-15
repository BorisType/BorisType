import path from 'node:path'
import fs from 'node:fs';
import ts from 'typescript';
import { cloneNode } from 'ts-clone-node';

const filePathMath = path.resolve(__dirname, '../../resources/Math.js');
const codeMath = fs.readFileSync(filePathMath, 'utf-8');

export function mathTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (sourceFile: ts.SourceFile) => {
    const implSource = ts.createSourceFile(`Math.js`, codeMath, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.JS);

    const REPLACE_METHODS = ['abs', 'ceil', 'floor', 'trunc'];
    const MAX_METHOD = 'max';
    const MIN_METHOD = 'min';
    const MAX_MIN_METHODS = [MAX_METHOD, MIN_METHOD];
    const usedMethods = new Set<string>();

    function visit(node: ts.Node): ts.Node {
      node = ts.visitEachChild(node, visit, context);
      if (ts.isCallExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression)) {
          const prop = node.expression;
          if (ts.isIdentifier(prop.expression) && prop.expression.text === 'Math') {
            const methodName = prop.name.text;
            if (REPLACE_METHODS.includes(methodName)) {
              usedMethods.add(methodName);
              const newFuncName = ts.factory.createIdentifier(`___btt_Math_${methodName}`);
              return ts.factory.createCallExpression(newFuncName, undefined, node.arguments);
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

    const transformed = ts.visitNode(sourceFile, visit) as ts.SourceFile;

    if (usedMethods.size > 0) {
      const newStatements: ts.Statement[] = [];

      for (const method of Array.from(usedMethods).sort()) {
        let funcStmt: ts.Statement | undefined;
        const hasImpl = REPLACE_METHODS.includes(method);

        if (hasImpl) {
          let code: string = codeMath;
          // const implSource = ts.createSourceFile(`Math_${method}.js`, code, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.JS);

          // Find the function declaration
          funcStmt = implSource.statements.find(
            (stmt): stmt is ts.FunctionDeclaration =>
              ts.isFunctionDeclaration(stmt) &&
              (stmt.name?.text === `___btt_Math_${method}` || stmt.name?.text === `__btt_Math_${method}`)
          );

          funcStmt = cloneNode(funcStmt);
        }

        if (MAX_MIN_METHODS.includes(method)) {
          continue;
        }

        if (!funcStmt) {
          const param = ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            ts.factory.createIdentifier('args'),
            undefined,
            ts.factory.createArrayTypeNode(ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)),
            undefined
          );
          const throwStmt = ts.factory.createThrowStatement(
            ts.factory.createNewExpression(
              ts.factory.createIdentifier('Error'),
              undefined,
              [ts.factory.createStringLiteral('unsupported yet')]
            )
          );
          const block = ts.factory.createBlock([throwStmt], true);
          funcStmt = ts.factory.createFunctionDeclaration(
            undefined,
            undefined,
            `___btt_Math_${method}`,
            undefined,
            [param],
            undefined,
            block
          );
        }

        newStatements.push(funcStmt);
      }

      return ts.factory.updateSourceFile(transformed, [...newStatements, ...transformed.statements]);
    }

    return transformed;
  };
}