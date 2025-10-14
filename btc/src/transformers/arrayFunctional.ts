import * as ts from "typescript";

export default function arrayFunctionalTransformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => (file: ts.SourceFile) => {
    const typeChecker = program.getTypeChecker();

    const arrayReturningMethods = new Set<string>(["map", "filter", "flatMap"]);
    const booleanReturningMethods = new Set<string>(["every", "some"]);
    const findMethods = new Set<string>(["find", "findIndex", "findLast", "findLastIndex"]);
    const reduceMethods = new Set<string>(["reduce", "reduceRight"]);
    const supportedMethods = new Set<string>([
      ...arrayReturningMethods,
      ...booleanReturningMethods,
      ...findMethods,
      "forEach",
      ...reduceMethods,
    ]);

    function containsSupportedMethod(expr: ts.Expression): boolean {
      if (ts.isCallExpression(expr)) {
        const callee = expr.expression;
        if (ts.isPropertyAccessExpression(callee)) {
          if (supportedMethods.has(callee.name.text)) return true;
          return containsSupportedMethod(callee.expression);
        }
        if (ts.isCallExpression(callee)) return containsSupportedMethod(callee);
        return false;
      }
      if (ts.isPropertyAccessExpression(expr)) {
        return containsSupportedMethod(expr.expression);
      }
      return false;
    }

    function getRootExpression(expr: ts.Expression): ts.Expression {
      if (ts.isCallExpression(expr)) {
        const callee = expr.expression;
        if (ts.isPropertyAccessExpression(callee) && arrayReturningMethods.has(callee.name.text)) {
          return callee.expression; // Returns obj.arr for obj.arr.map, filter, flatMap
        }
        return getRootExpression(callee);
      }
      if (ts.isPropertyAccessExpression(expr)) {
        return getRootExpression(expr.expression);
      }
      return expr;
    }

    function transformChain(
      expression: ts.Expression,
      statements: ts.Statement[],
      tempVarPrefix: string,
      index: number
    ): { expr: ts.Expression; statements: ts.Statement[] } {
      if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
        const methodName = expression.expression.name.text;
        const objExpr = expression.expression.expression;

        const base = transformChain(objExpr, statements, tempVarPrefix, index + 1);
        const baseExpr = base.expr;
        const accStatements = base.statements;

        if (supportedMethods.has(methodName)) {
          const callback = expression.arguments[0];
          const iVar = ts.factory.createUniqueName(`i_${index}`);

          const loopBody: ts.Statement[] = [];
          let callbackBody: ts.ConciseBody | undefined;
          let callbackParams: ts.NodeArray<ts.ParameterDeclaration> | undefined;

          if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
            callbackParams = callback.parameters;
            callbackBody = callback.body;
          }

          const elementExpr = ts.factory.createElementAccessExpression(baseExpr, iVar);
          const indexExpr = iVar;
          const arrayExpr = baseExpr;

          const resultVar = ts.factory.createUniqueName(`result_${index}`);

          if (reduceMethods.has(methodName)) {
            const isRight = methodName === "reduceRight";
            const tempResult = ts.factory.createUniqueName(`${tempVarPrefix}_${index}`);
            const initialValue = expression.arguments[1] || ts.factory.createIdentifier("undefined");

            // Define tempResult variable
            const tempDecl = ts.factory.createVariableStatement(
              undefined,
              ts.factory.createVariableDeclarationList(
                [
                  ts.factory.createVariableDeclaration(
                    tempResult,
                    undefined,
                    undefined,
                    initialValue
                  ),
                ],
                ts.NodeFlags.Let
              )
            );

            // Handle callback parameters
            if (callbackParams && callbackParams.length >= 1) {
              const accumulatorParam = callbackParams[0].name;
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        accumulatorParam,
                        undefined,
                        undefined,
                        tempResult // Use tempResult consistently
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }
            if (callbackParams && callbackParams.length >= 2) {
              const currentParam = callbackParams[1].name;
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        currentParam,
                        undefined,
                        undefined,
                        elementExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }
            if (callbackParams && callbackParams.length >= 3) {
              const indexParam = callbackParams[2].name;
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        indexParam,
                        undefined,
                        undefined,
                        indexExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }
            if (callbackParams && callbackParams.length >= 4) {
              const arrayParam = callbackParams[3].name;
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        arrayParam,
                        undefined,
                        undefined,
                        arrayExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }

            // Handle callback body
            if (callbackBody) {
              if (ts.isBlock(callbackBody)) {
                const nonReturn = callbackBody.statements.filter((s) => !ts.isReturnStatement(s));
                loopBody.push(...nonReturn);

                const ret = callbackBody.statements.find(ts.isReturnStatement);
                if (ret) {
                  loopBody.push(
                    ts.factory.createVariableStatement(
                      undefined,
                      ts.factory.createVariableDeclarationList(
                        [
                          ts.factory.createVariableDeclaration(
                            resultVar,
                            undefined,
                            undefined,
                            ret.expression ?? ts.factory.createIdentifier("undefined")
                          ),
                        ],
                        ts.NodeFlags.Const
                      )
                    )
                  );
                } else {
                  loopBody.push(
                    ts.factory.createVariableStatement(
                      undefined,
                      ts.factory.createVariableDeclarationList(
                        [ts.factory.createVariableDeclaration(resultVar, undefined, undefined, ts.factory.createIdentifier("undefined"))],
                        ts.NodeFlags.Const
                      )
                    )
                  );
                }
              } else {
                loopBody.push(
                  ts.factory.createVariableStatement(
                    undefined,
                    ts.factory.createVariableDeclarationList(
                      [ts.factory.createVariableDeclaration(resultVar, undefined, undefined, callbackBody)],
                      ts.NodeFlags.Const
                    )
                  )
                );
              }
            } else {
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        resultVar,
                        undefined,
                        undefined,
                        elementExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }

            // Update tempResult with resultVar
            loopBody.push(
              ts.factory.createExpressionStatement(
                ts.factory.createBinaryExpression(
                  tempResult,
                  ts.SyntaxKind.EqualsToken,
                  resultVar
                )
              )
            );

            // Create for loop
            const initializer = isRight
              ? ts.factory.createBinaryExpression(
                ts.factory.createPropertyAccessExpression(baseExpr, "length"),
                ts.SyntaxKind.MinusToken,
                ts.factory.createNumericLiteral("1")
              )
              : ts.factory.createNumericLiteral("0");

            const conditionOp = isRight
              ? ts.factory.createBinaryExpression(iVar, ts.SyntaxKind.GreaterThanEqualsToken, ts.factory.createNumericLiteral("0"))
              : ts.factory.createBinaryExpression(iVar, ts.SyntaxKind.LessThanToken, ts.factory.createPropertyAccessExpression(baseExpr, "length"));

            const increment = isRight
              ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusMinusToken, iVar)
              : ts.factory.createPostfixUnaryExpression(iVar, ts.SyntaxKind.PlusPlusToken);

            const forLoop = ts.factory.createForStatement(
              ts.factory.createVariableDeclarationList(
                [ts.factory.createVariableDeclaration(iVar, undefined, undefined, initializer)],
                ts.NodeFlags.Let
              ),
              conditionOp,
              increment,
              ts.factory.createBlock(loopBody, true)
            );

            return {
              expr: tempResult,
              statements: [...accStatements, tempDecl, forLoop],
            };
          } else {
            // Handle non-reduce methods (map, filter, flatMap, forEach, etc.)
            if (callbackParams && callbackParams.length >= 1) {
              const elementParam = callbackParams[0].name;
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        elementParam,
                        undefined,
                        undefined,
                        elementExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }
            if (callbackParams && callbackParams.length >= 2) {
              const indexParam = callbackParams[1].name;
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        indexParam,
                        undefined,
                        undefined,
                        indexExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }
            if (callbackParams && callbackParams.length >= 3) {
              const arrayParam = callbackParams[2].name;
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        arrayParam,
                        undefined,
                        undefined,
                        arrayExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }

            // Handle callback body
            if (callbackBody) {
              if (ts.isBlock(callbackBody)) {
                const nonReturn = callbackBody.statements.filter((s) => !ts.isReturnStatement(s));
                loopBody.push(...nonReturn);

                const ret = callbackBody.statements.find(ts.isReturnStatement);
                if (ret) {
                  loopBody.push(
                    ts.factory.createVariableStatement(
                      undefined,
                      ts.factory.createVariableDeclarationList(
                        [
                          ts.factory.createVariableDeclaration(
                            resultVar,
                            undefined,
                            undefined,
                            ret.expression ?? ts.factory.createIdentifier("undefined")
                          ),
                        ],
                        ts.NodeFlags.Const
                      )
                    )
                  );
                } else {
                  loopBody.push(
                    ts.factory.createVariableStatement(
                      undefined,
                      ts.factory.createVariableDeclarationList(
                        [ts.factory.createVariableDeclaration(resultVar, undefined, undefined, ts.factory.createIdentifier("undefined"))],
                        ts.NodeFlags.Const
                      )
                    )
                  );
                }
              } else {
                loopBody.push(
                  ts.factory.createVariableStatement(
                    undefined,
                    ts.factory.createVariableDeclarationList(
                      [ts.factory.createVariableDeclaration(resultVar, undefined, undefined, callbackBody)],
                      ts.NodeFlags.Const
                    )
                  )
                );
              }
            } else {
              loopBody.push(
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [
                      ts.factory.createVariableDeclaration(
                        resultVar,
                        undefined,
                        undefined,
                        elementExpr
                      ),
                    ],
                    ts.NodeFlags.Const
                  )
                )
              );
            }

            let tempDecl: ts.Statement | undefined;
            let forLoop: ts.Statement | undefined;
            let expr: ts.Expression;

            if (methodName === "forEach") {
              forLoop = ts.factory.createForStatement(
                ts.factory.createVariableDeclarationList(
                  [ts.factory.createVariableDeclaration(iVar, undefined, undefined, ts.factory.createNumericLiteral("0"))],
                  ts.NodeFlags.Let
                ),
                ts.factory.createBinaryExpression(
                  iVar,
                  ts.SyntaxKind.LessThanToken,
                  ts.factory.createPropertyAccessExpression(baseExpr, "length")
                ),
                ts.factory.createPostfixUnaryExpression(iVar, ts.SyntaxKind.PlusPlusToken),
                ts.factory.createBlock(loopBody, true)
              );

              expr = ts.factory.createIdentifier("undefined"); // forEach returns undefined
            } else if (booleanReturningMethods.has(methodName)) {
              const isEvery = methodName === "every";
              const tempResult = ts.factory.createUniqueName(`${tempVarPrefix}_${index}`);

              tempDecl = ts.factory.createVariableStatement(
                undefined,
                ts.factory.createVariableDeclarationList(
                  [
                    ts.factory.createVariableDeclaration(
                      tempResult,
                      undefined,
                      undefined,
                      isEvery ? ts.factory.createTrue() : ts.factory.createFalse()
                    ),
                  ],
                  ts.NodeFlags.Let
                )
              );

              loopBody.push(
                ts.factory.createIfStatement(
                  isEvery
                    ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, resultVar)
                    : resultVar,
                  ts.factory.createBlock(
                    [
                      ts.factory.createExpressionStatement(
                        ts.factory.createBinaryExpression(
                          tempResult,
                          ts.SyntaxKind.EqualsToken,
                          isEvery ? ts.factory.createFalse() : ts.factory.createTrue()
                        )
                      ),
                      ts.factory.createBreakStatement(),
                    ],
                    true
                  )
                )
              );

              forLoop = ts.factory.createForStatement(
                ts.factory.createVariableDeclarationList(
                  [ts.factory.createVariableDeclaration(iVar, undefined, undefined, ts.factory.createNumericLiteral("0"))],
                  ts.NodeFlags.Let
                ),
                ts.factory.createBinaryExpression(
                  iVar,
                  ts.SyntaxKind.LessThanToken,
                  ts.factory.createPropertyAccessExpression(baseExpr, "length")
                ),
                ts.factory.createPostfixUnaryExpression(iVar, ts.SyntaxKind.PlusPlusToken),
                ts.factory.createBlock(loopBody, true)
              );

              expr = tempResult;
            } else if (findMethods.has(methodName)) {
              const isIndex = methodName.endsWith("Index");
              const isLast = methodName.startsWith("findLast");
              const tempResult = ts.factory.createUniqueName(`${tempVarPrefix}_${index}`);

              tempDecl = ts.factory.createVariableStatement(
                undefined,
                ts.factory.createVariableDeclarationList(
                  [
                    ts.factory.createVariableDeclaration(
                      tempResult,
                      undefined,
                      undefined,
                      isIndex ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, ts.factory.createNumericLiteral("1")) : ts.factory.createIdentifier("undefined")
                    ),
                  ],
                  ts.NodeFlags.Let
                )
              );

              loopBody.push(
                ts.factory.createIfStatement(
                  resultVar,
                  ts.factory.createBlock(
                    [
                      ts.factory.createExpressionStatement(
                        ts.factory.createBinaryExpression(
                          tempResult,
                          ts.SyntaxKind.EqualsToken,
                          isIndex ? iVar : ts.factory.createElementAccessExpression(baseExpr, iVar)
                        )
                      ),
                      ts.factory.createBreakStatement(),
                    ],
                    true
                  )
                )
              );

              const initializer = isLast
                ? ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(baseExpr, "length"),
                  ts.SyntaxKind.MinusToken,
                  ts.factory.createNumericLiteral("1")
                )
                : ts.factory.createNumericLiteral("0");

              const conditionOp = isLast
                ? ts.factory.createBinaryExpression(iVar, ts.SyntaxKind.GreaterThanEqualsToken, ts.factory.createNumericLiteral("0"))
                : ts.factory.createBinaryExpression(iVar, ts.SyntaxKind.LessThanToken, ts.factory.createPropertyAccessExpression(baseExpr, "length"));

              const increment = isLast
                ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusMinusToken, iVar)
                : ts.factory.createPostfixUnaryExpression(iVar, ts.SyntaxKind.PlusPlusToken);

              forLoop = ts.factory.createForStatement(
                ts.factory.createVariableDeclarationList(
                  [ts.factory.createVariableDeclaration(iVar, undefined, undefined, initializer)],
                  ts.NodeFlags.Let
                ),
                conditionOp,
                increment,
                ts.factory.createBlock(loopBody, true)
              );

              expr = tempResult;
            } else {
              const tempArr = ts.factory.createUniqueName(`${tempVarPrefix}_${index}`);
              tempDecl = ts.factory.createVariableStatement(
                undefined,
                ts.factory.createVariableDeclarationList(
                  [
                    ts.factory.createVariableDeclaration(
                      tempArr,
                      undefined,
                      undefined,
                      ts.factory.createArrayLiteralExpression([], false)
                    ),
                  ],
                  ts.NodeFlags.Const
                )
              );

              let pushStatement: ts.Statement;
              if (methodName === "map") {
                const newPropertyAccessExpression = ts.factory.createPropertyAccessExpression(tempArr, "push");
                const newCallExpression = ts.factory.createCallExpression(
                  newPropertyAccessExpression,
                  undefined,
                  [resultVar]
                );
                // workaround for a TypeScript behavior where the parent is not set automatically
                (newPropertyAccessExpression as any).parent = newCallExpression;

                pushStatement = ts.factory.createExpressionStatement(
                  newCallExpression
                );
              } else if (methodName === "filter") {
                const newPropertyAccessExpression = ts.factory.createPropertyAccessExpression(tempArr, "push");
                const newCallExpression = ts.factory.createCallExpression(
                  newPropertyAccessExpression,
                  undefined,
                  [ts.factory.createElementAccessExpression(baseExpr, iVar)]
                );
                // workaround for a TypeScript behavior where the parent is not set automatically
                (newPropertyAccessExpression as any).parent = newCallExpression;

                pushStatement = ts.factory.createIfStatement(
                  resultVar,
                  ts.factory.createExpressionStatement(
                    newCallExpression
                  )
                );
              } else { // flatMap
                const jVar = ts.factory.createUniqueName(`j_${index}`);

                const newPropertyAccessExpression = ts.factory.createPropertyAccessExpression(tempArr, "push");
                const newCallExpression = ts.factory.createCallExpression(
                  newPropertyAccessExpression,
                  undefined,
                  [ts.factory.createElementAccessExpression(resultVar, jVar)]
                );
                // workaround for a TypeScript behavior where the parent is not set automatically
                (newPropertyAccessExpression as any).parent = newCallExpression;

                pushStatement = ts.factory.createForStatement(
                  ts.factory.createVariableDeclarationList(
                    [ts.factory.createVariableDeclaration(jVar, undefined, undefined, ts.factory.createNumericLiteral("0"))],
                    ts.NodeFlags.Let
                  ),
                  ts.factory.createBinaryExpression(
                    jVar,
                    ts.SyntaxKind.LessThanToken,
                    ts.factory.createPropertyAccessExpression(resultVar, "length")
                  ),
                  ts.factory.createPostfixUnaryExpression(jVar, ts.SyntaxKind.PlusPlusToken),
                  ts.factory.createBlock(
                    [
                      ts.factory.createExpressionStatement(
                        newCallExpression
                      ),
                    ],
                    true
                  )
                );
              }
              loopBody.push(pushStatement);

              forLoop = ts.factory.createForStatement(
                ts.factory.createVariableDeclarationList(
                  [ts.factory.createVariableDeclaration(iVar, undefined, undefined, ts.factory.createNumericLiteral("0"))],
                  ts.NodeFlags.Let
                ),
                ts.factory.createBinaryExpression(
                  iVar,
                  ts.SyntaxKind.LessThanToken,
                  ts.factory.createPropertyAccessExpression(baseExpr, "length")
                ),
                ts.factory.createPostfixUnaryExpression(iVar, ts.SyntaxKind.PlusPlusToken),
                ts.factory.createBlock(loopBody, true)
              );

              expr = tempArr;
            }

            return {
              expr: expr,
              statements: [...accStatements, ...(tempDecl ? [tempDecl] : []), ...(forLoop ? [forLoop] : [])],
            };
          }
        } else {
          const nextTemp = ts.factory.createUniqueName(`${tempVarPrefix}_${index}_${methodName}`);

          const newPropertyAccessExpression = ts.factory.createPropertyAccessExpression(baseExpr, methodName);
          const newCallExpression = ts.factory.createCallExpression(
            newPropertyAccessExpression,
            undefined,
            expression.arguments
          );
          // workaround for a TypeScript behavior where the parent is not set automatically
          (newPropertyAccessExpression as any).parent = newCallExpression;

          const methodCallDecl = ts.factory.createVariableStatement(
            undefined,
            ts.factory.createVariableDeclarationList(
              [
                ts.factory.createVariableDeclaration(
                  nextTemp,
                  undefined,
                  undefined,
                  newCallExpression
                ),
              ],
              ts.NodeFlags.Const
            )
          );

          return {
            expr: nextTemp,
            statements: [...accStatements, methodCallDecl],
          };
        }
      }

      if (ts.isPropertyAccessExpression(expression)) {
        const base = transformChain(expression.expression, statements, tempVarPrefix, index + 1);
        return {
          expr: ts.factory.createPropertyAccessExpression(base.expr, expression.name),
          statements: base.statements,
        };
      }

      return { expr: expression, statements };
    }

    function transformExpression(
      node: ts.Expression,
      tempVarPrefix: string
    ): { expr: ts.Expression; statements: ts.Statement[] } {
      if ((ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) && containsSupportedMethod(node)) {
        const root = getRootExpression(node);
        const rootType = typeChecker.getTypeAtLocation(root);
        if (rootType && (typeChecker.isArrayType(rootType) || typeChecker.isTupleType(rootType))) {
          return transformChain(node, [], tempVarPrefix, 1);
        }
      }

      if (ts.isCallExpression(node)) {
        const transformedArgs: ts.Expression[] = [];
        const allStatements: ts.Statement[] = [];

        // Transform the callee expression
        const calleeResult = transformExpression(node.expression, `${tempVarPrefix}_callee`);
        allStatements.push(...calleeResult.statements);
        const transformedCallee = calleeResult.expr;

        // Transform each argument
        node.arguments.forEach((arg, index) => {
          const result = transformExpression(arg, `${tempVarPrefix}_arg${index}`);
          transformedArgs.push(result.expr);
          allStatements.push(...result.statements);
        });

        return {
          expr: ts.factory.createCallExpression(transformedCallee, node.typeArguments, transformedArgs),
          statements: allStatements,
        };
      }

      if (ts.isArrayLiteralExpression(node)) {
        const transformedElements: ts.Expression[] = [];
        const allStatements: ts.Statement[] = [];

        node.elements.forEach((element, index) => {
          if (ts.isSpreadElement(element)) {
            const result = transformExpression(element.expression, `${tempVarPrefix}_elem${index}`);
            transformedElements.push(ts.factory.createSpreadElement(result.expr));
            allStatements.push(...result.statements);
          } else {
            const result = transformExpression(element, `${tempVarPrefix}_elem${index}`);
            transformedElements.push(result.expr);
            allStatements.push(...result.statements);
          }
        });

        return {
          expr: ts.factory.createArrayLiteralExpression(transformedElements),
          statements: allStatements,
        };
      }

      if (ts.isObjectLiteralExpression(node)) {
        const transformedProperties: ts.ObjectLiteralElementLike[] = [];
        const allStatements: ts.Statement[] = [];

        node.properties.forEach((property, index) => {
          if (ts.isPropertyAssignment(property) && property.initializer) {
            const result = transformExpression(property.initializer, `${tempVarPrefix}_prop${index}`);
            transformedProperties.push(
              ts.factory.createPropertyAssignment(property.name, result.expr)
            );
            allStatements.push(...result.statements);
          } else if (ts.isShorthandPropertyAssignment(property)) {
            const result = transformExpression(
              ts.factory.createIdentifier(property.name.text),
              `${tempVarPrefix}_prop${index}`
            );
            if (ts.isIdentifier(result.expr)) {
              transformedProperties.push(
                ts.factory.createShorthandPropertyAssignment(
                  result.expr.text,
                  property.objectAssignmentInitializer
                )
              );
            } else {
              transformedProperties.push(
                ts.factory.createPropertyAssignment(
                  property.name,
                  result.expr
                )
              );
            }
            allStatements.push(...result.statements);
          } else {
            transformedProperties.push(property);
          }
        });

        return {
          expr: ts.factory.createObjectLiteralExpression(transformedProperties),
          statements: allStatements,
        };
      }

      return { expr: node, statements: [] };
    }

    function visit(node: ts.Node): ts.Node | ts.Node[] {
      if (ts.isVariableStatement(node)) {
        const declList = node.declarationList;
        if (declList.declarations.length === 1) {
          const decl = declList.declarations[0];
          const init = decl.initializer;

          if (init) {
            const { expr: finalExpr, statements } = transformExpression(init, `temp_${decl.name.getText()}`);
            if (statements.length > 0) {
              const assignStatement = ts.factory.createVariableStatement(
                node.modifiers,
                ts.factory.createVariableDeclarationList(
                  [
                    ts.factory.createVariableDeclaration(
                      decl.name,
                      decl.exclamationToken,
                      decl.type,
                      finalExpr
                    ),
                  ],
                  declList.flags
                )
              );
              return [...statements, assignStatement];
            }
          }
        }
      }

      if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = node.expression.left;
        const right = node.expression.right;

        const { expr: finalExpr, statements } = transformExpression(right, `temp_${ts.isIdentifier(left) ? left.getText() : "temp"}`);
        if (statements.length > 0) {
          const assignStatement = ts.factory.createExpressionStatement(
            ts.factory.createBinaryExpression(
              left,
              ts.SyntaxKind.EqualsToken,
              finalExpr
            )
          );
          return [...statements, assignStatement];
        }
      }

      if (ts.isExpressionStatement(node) &&
        (ts.isCallExpression(node.expression) ||
          ts.isPropertyAccessExpression(node.expression) ||
          ts.isArrayLiteralExpression(node.expression) ||
          ts.isObjectLiteralExpression(node.expression))) {
        const { expr: finalExpr, statements } = transformExpression(node.expression, "temp_standalone");
        if (statements.length > 0 && !ts.isCallExpression(finalExpr)) {
          return statements;
        }
        if (statements.length > 0) {
          return [...statements, ts.factory.createExpressionStatement(finalExpr)];
        }
      }

      if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
        const callExpr = node.expression;
        const { expr: transformedCall, statements } = transformExpression(callExpr, "temp_call");
        if (statements.length > 0) {
          return [...statements, ts.factory.createExpressionStatement(transformedCall)];
        }
      }

      if (ts.isReturnStatement(node) && node.expression) {
        const { expr: finalExpr, statements } = transformExpression(node.expression, "temp_return");
        if (statements.length > 0) {
          return [...statements, ts.factory.createReturnStatement(finalExpr)];
        }
      }

      return ts.visitEachChild(node, visit, context);
    }

    return ts.visitNode(file, visit) as ts.SourceFile;
  };
}