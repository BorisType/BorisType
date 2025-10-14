import * as ts from 'typescript';

export default function arrayGeneralTransformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => (file: ts.SourceFile) => {
    const typeChecker = program.getTypeChecker();
    let hasAtMethod = false;
    let hasCopyWithinMethod = false;
    let hasFillMethod = false;

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
            hasAtMethod = true; // Set flag when .at() is found
            // Replace arr.at(index) with __bt_tt_arrayAt(arr, index)
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier('__bt_tt_arrayAt'),
              undefined,
              [expression, ...node.arguments]
            );
          }

          if (node.expression.name.text === 'concat') {
            // Replace arr1.concat(arr2, ...arrN) with ArrayUnion(arr1, arr2, ...arrN)
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier('ArrayUnion'),
              undefined,
              [expression, ...node.arguments]
            );
          }

          if (node.expression.name.text === 'copyWithin') {
            hasCopyWithinMethod = true; // Set flag when .copyWithin() is found
            // Replace arr.copyWithin(target, start, end) with __bt_tt_arrayCopyWithin(arr, target, start, end)
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier('__bt_tt_arrayCopyWithin'),
              undefined,
              [expression, ...node.arguments]
            );
          }

          if (node.expression.name.text === 'fill') {
            hasFillMethod = true; // Set flag when .fill() is found
            // Replace arr.fill(value, start, end) with __bt_tt_arrayFill(arr, value, start, end)
            // Explicitly pass undefined for optional start and end if not provided
            const args = [
              expression,
              node.arguments[0] || ts.factory.createIdentifier('undefined'), // value
              node.arguments[1] || ts.factory.createIdentifier('undefined'), // start
              node.arguments[2] || ts.factory.createIdentifier('undefined')  // end
            ];
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier('__bt_tt_arrayFill'),
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

    // Visit the file to transform nodes and check for method usage
    const transformedFile = ts.visitNode(file, visit) as ts.SourceFile;

    // Add helper functions only if their respective methods were found
    const updatedStatements = [
      ...(hasAtMethod ? [generateArrayAtHelper()] : []),
      ...(hasCopyWithinMethod ? [generateArrayCopyWithinHelper()] : []),
      ...(hasFillMethod ? [generateArrayFillHelper()] : []),
      ...transformedFile.statements
    ];

    return ts.factory.updateSourceFile(transformedFile, updatedStatements);
  };
}


function generateArrayAtHelper(): ts.FunctionDeclaration {
  // Create the __bt_tt_arrayAt helper function
  return ts.factory.createFunctionDeclaration(
    undefined,
    undefined,
    '__bt_tt_arrayAt',
    undefined,
    [
      ts.factory.createParameterDeclaration(undefined, undefined, 'array', undefined, undefined, undefined),
      ts.factory.createParameterDeclaration(undefined, undefined, 'index', undefined, undefined, undefined)
    ],
    undefined,
    ts.factory.createBlock([
      ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier('array'),
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.factory.createIdentifier('undefined')
          ),
          ts.SyntaxKind.BarBarToken,
          ts.factory.createBinaryExpression(
            ts.factory.createBinaryExpression(
              ts.factory.createIdentifier('array'),
              ts.SyntaxKind.EqualsEqualsEqualsToken,
              ts.factory.createNull()
            ),
            ts.SyntaxKind.BarBarToken,
            ts.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('IsArray'),
                undefined,
                [ts.factory.createIdentifier('array')]
              )
            )
          )
        ),
        ts.factory.createReturnStatement(ts.factory.createIdentifier('undefined'))
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'len',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('ArrayCount'),
              undefined,
              [ts.factory.createIdentifier('array')]
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'normalizedIndex',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('Int'),
              undefined,
              [ts.factory.createIdentifier('index')]
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createIdentifier('normalizedIndex'),
          ts.SyntaxKind.LessThanToken,
          ts.factory.createNumericLiteral('0')
        ),
        ts.factory.createBlock([
          ts.factory.createVariableStatement(
            undefined,
            ts.factory.createVariableDeclarationList(
              [ts.factory.createVariableDeclaration(
                'positiveIndex',
                undefined,
                undefined,
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier('len'),
                  ts.SyntaxKind.PlusToken,
                  ts.factory.createIdentifier('normalizedIndex')
                )
              )],
              ts.NodeFlags.Const
            )
          ),
          ts.factory.createReturnStatement(
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('positiveIndex'),
                ts.SyntaxKind.GreaterThanEqualsToken,
                ts.factory.createNumericLiteral('0')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createElementAccessExpression(
                ts.factory.createIdentifier('array'),
                ts.factory.createIdentifier('positiveIndex')
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createIdentifier('undefined')
            )
          )
        ])
      ),
      ts.factory.createReturnStatement(
        ts.factory.createConditionalExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier('normalizedIndex'),
            ts.SyntaxKind.LessThanToken,
            ts.factory.createIdentifier('len')
          ),
          ts.factory.createToken(ts.SyntaxKind.QuestionToken),
          ts.factory.createElementAccessExpression(
            ts.factory.createIdentifier('array'),
            ts.factory.createIdentifier('normalizedIndex')
          ),
          ts.factory.createToken(ts.SyntaxKind.ColonToken),
          ts.factory.createIdentifier('undefined')
        )
      )
    ])
  );
}

function generateArrayCopyWithinHelper(): ts.FunctionDeclaration {
  // Create the __bt_tt_arrayCopyWithin helper function
  return ts.factory.createFunctionDeclaration(
    undefined,
    undefined,
    '__bt_tt_arrayCopyWithin',
    undefined,
    [
      ts.factory.createParameterDeclaration(undefined, undefined, 'array', undefined, undefined, undefined),
      ts.factory.createParameterDeclaration(undefined, undefined, 'target', undefined, undefined, undefined),
      ts.factory.createParameterDeclaration(undefined, undefined, 'start', undefined, undefined, undefined),
      ts.factory.createParameterDeclaration(undefined, undefined, 'end', undefined, undefined, undefined)
    ],
    undefined,
    ts.factory.createBlock([
      ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier('array'),
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.factory.createIdentifier('undefined')
          ),
          ts.SyntaxKind.BarBarToken,
          ts.factory.createBinaryExpression(
            ts.factory.createBinaryExpression(
              ts.factory.createIdentifier('array'),
              ts.SyntaxKind.EqualsEqualsEqualsToken,
              ts.factory.createNull()
            ),
            ts.SyntaxKind.BarBarToken,
            ts.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('IsArray'),
                undefined,
                [ts.factory.createIdentifier('array')]
              )
            )
          )
        ),
        ts.factory.createReturnStatement(ts.factory.createIdentifier('undefined'))
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'len',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('ArrayCount'),
              undefined,
              [ts.factory.createIdentifier('array')]
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'to',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('Int'),
              undefined,
              [ts.factory.createIdentifier('target')]
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'from',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('Int'),
              undefined,
              [ts.factory.createIdentifier('start')]
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'final',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('OptInt'),
                undefined,
                [ts.factory.createIdentifier('end')]
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Int'),
                undefined,
                [ts.factory.createIdentifier('end')]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createIdentifier('len')
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'normalizedTarget',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('to'),
                ts.SyntaxKind.LessThanToken,
                ts.factory.createNumericLiteral('0')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Max'),
                undefined,
                [
                  ts.factory.createBinaryExpression(
                    ts.factory.createIdentifier('len'),
                    ts.SyntaxKind.PlusToken,
                    ts.factory.createIdentifier('to')
                  ),
                  ts.factory.createNumericLiteral('0')
                ]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Min'),
                undefined,
                [ts.factory.createIdentifier('to'), ts.factory.createIdentifier('len')]
              )
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'normalizedStart',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('from'),
                ts.SyntaxKind.LessThanToken,
                ts.factory.createNumericLiteral('0')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Max'),
                undefined,
                [
                  ts.factory.createBinaryExpression(
                    ts.factory.createIdentifier('len'),
                    ts.SyntaxKind.PlusToken,
                    ts.factory.createIdentifier('from')
                  ),
                  ts.factory.createNumericLiteral('0')
                ]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Min'),
                undefined,
                [ts.factory.createIdentifier('from'), ts.factory.createIdentifier('len')]
              )
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'normalizedEnd',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('final'),
                ts.SyntaxKind.LessThanToken,
                ts.factory.createNumericLiteral('0')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Max'),
                undefined,
                [
                  ts.factory.createBinaryExpression(
                    ts.factory.createIdentifier('len'),
                    ts.SyntaxKind.PlusToken,
                    ts.factory.createIdentifier('final')
                  ),
                  ts.factory.createNumericLiteral('0')
                ]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Min'),
                undefined,
                [ts.factory.createIdentifier('final'), ts.factory.createIdentifier('len')]
              )
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'count',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('Min'),
              undefined,
              [
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier('normalizedEnd'),
                  ts.SyntaxKind.MinusToken,
                  ts.factory.createIdentifier('normalizedStart')
                ),
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier('len'),
                  ts.SyntaxKind.MinusToken,
                  ts.factory.createIdentifier('normalizedTarget')
                )
              ]
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createIdentifier('count'),
          ts.SyntaxKind.GreaterThanToken,
          ts.factory.createNumericLiteral('0')
        ),
        ts.factory.createBlock([
          ts.factory.createIfStatement(
            ts.factory.createBinaryExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('normalizedStart'),
                ts.SyntaxKind.LessThanToken,
                ts.factory.createIdentifier('normalizedTarget')
              ),
              ts.SyntaxKind.AmpersandAmpersandToken,
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('normalizedTarget'),
                ts.SyntaxKind.LessThanToken,
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier('normalizedStart'),
                  ts.SyntaxKind.PlusToken,
                  ts.factory.createIdentifier('count')
                )
              )
            ),
            ts.factory.createBlock([
              ts.factory.createForStatement(
                ts.factory.createVariableDeclarationList(
                  [ts.factory.createVariableDeclaration(
                    ts.factory.createIdentifier('i'),
                    undefined,
                    undefined,
                    ts.factory.createBinaryExpression(
                      ts.factory.createIdentifier('count'),
                      ts.SyntaxKind.MinusToken,
                      ts.factory.createNumericLiteral('1')
                    )
                  )],
                  ts.NodeFlags.Let
                ),
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier('i'),
                  ts.SyntaxKind.GreaterThanEqualsToken,
                  ts.factory.createNumericLiteral('0')
                ),
                ts.factory.createPostfixUnaryExpression(
                  ts.factory.createIdentifier('i'),
                  ts.SyntaxKind.MinusMinusToken
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier('array'),
                      ts.factory.createBinaryExpression(
                        ts.factory.createIdentifier('normalizedTarget'),
                        ts.SyntaxKind.PlusToken,
                        ts.factory.createIdentifier('i')
                      )
                    ),
                    ts.SyntaxKind.EqualsToken,
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier('array'),
                      ts.factory.createBinaryExpression(
                        ts.factory.createIdentifier('normalizedStart'),
                        ts.SyntaxKind.PlusToken,
                        ts.factory.createIdentifier('i')
                      )
                    )
                  )
                )
              )
            ]),
            ts.factory.createBlock([
              ts.factory.createForStatement(
                ts.factory.createVariableDeclarationList(
                  [ts.factory.createVariableDeclaration(
                    ts.factory.createIdentifier('i'),
                    undefined,
                    undefined,
                    ts.factory.createNumericLiteral('0')
                  )],
                  ts.NodeFlags.Let
                ),
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier('i'),
                  ts.SyntaxKind.LessThanToken,
                  ts.factory.createIdentifier('count')
                ),
                ts.factory.createPostfixUnaryExpression(
                  ts.factory.createIdentifier('i'),
                  ts.SyntaxKind.PlusPlusToken
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier('array'),
                      ts.factory.createBinaryExpression(
                        ts.factory.createIdentifier('normalizedTarget'),
                        ts.SyntaxKind.PlusToken,
                        ts.factory.createIdentifier('i')
                      )
                    ),
                    ts.SyntaxKind.EqualsToken,
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier('array'),
                      ts.factory.createBinaryExpression(
                        ts.factory.createIdentifier('normalizedStart'),
                        ts.SyntaxKind.PlusToken,
                        ts.factory.createIdentifier('i')
                      )
                    )
                  )
                )
              )
            ])
          )
        ])
      ),
      ts.factory.createReturnStatement(ts.factory.createIdentifier('array'))
    ])
  );
}

function generateArrayFillHelper(): ts.FunctionDeclaration {
  // Create the __bt_tt_arrayFill helper function
  return ts.factory.createFunctionDeclaration(
    undefined,
    undefined,
    '__bt_tt_arrayFill',
    undefined,
    [
      ts.factory.createParameterDeclaration(undefined, undefined, 'array', undefined, undefined, undefined),
      ts.factory.createParameterDeclaration(undefined, undefined, 'value', undefined, undefined, undefined),
      ts.factory.createParameterDeclaration(undefined, undefined, 'start', undefined, undefined, undefined),
      ts.factory.createParameterDeclaration(undefined, undefined, 'end', undefined, undefined, undefined)
    ],
    undefined,
    ts.factory.createBlock([
      ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createIdentifier('array'),
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.factory.createIdentifier('undefined')
          ),
          ts.SyntaxKind.BarBarToken,
          ts.factory.createBinaryExpression(
            ts.factory.createBinaryExpression(
              ts.factory.createIdentifier('array'),
              ts.SyntaxKind.EqualsEqualsEqualsToken,
              ts.factory.createNull()
            ),
            ts.SyntaxKind.BarBarToken,
            ts.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('IsArray'),
                undefined,
                [ts.factory.createIdentifier('array')]
              )
            )
          )
        ),
        ts.factory.createReturnStatement(ts.factory.createIdentifier('array'))
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'len',
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createIdentifier('ArrayCount'),
              undefined,
              [ts.factory.createIdentifier('array')]
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'normalizedStart',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('start'),
                ts.SyntaxKind.EqualsEqualsEqualsToken,
                ts.factory.createIdentifier('undefined')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createNumericLiteral('0'),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Int'),
                undefined,
                [ts.factory.createIdentifier('start')]
              )
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'normalizedEnd',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('end'),
                ts.SyntaxKind.EqualsEqualsEqualsToken,
                ts.factory.createIdentifier('undefined')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createIdentifier('len'),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Int'),
                undefined,
                [ts.factory.createIdentifier('end')]
              )
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'from',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('normalizedStart'),
                ts.SyntaxKind.LessThanToken,
                ts.factory.createNumericLiteral('0')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Max'),
                undefined,
                [
                  ts.factory.createBinaryExpression(
                    ts.factory.createIdentifier('len'),
                    ts.SyntaxKind.PlusToken,
                    ts.factory.createIdentifier('normalizedStart')
                  ),
                  ts.factory.createNumericLiteral('0')
                ]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Min'),
                undefined,
                [ts.factory.createIdentifier('normalizedStart'), ts.factory.createIdentifier('len')]
              )
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            'to',
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier('normalizedEnd'),
                ts.SyntaxKind.LessThanToken,
                ts.factory.createNumericLiteral('0')
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Max'),
                undefined,
                [
                  ts.factory.createBinaryExpression(
                    ts.factory.createIdentifier('len'),
                    ts.SyntaxKind.PlusToken,
                    ts.factory.createIdentifier('normalizedEnd')
                  ),
                  ts.factory.createNumericLiteral('0')
                ]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('Min'),
                undefined,
                [ts.factory.createIdentifier('normalizedEnd'), ts.factory.createIdentifier('len')]
              )
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createForStatement(
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier('i'),
            undefined,
            undefined,
            ts.factory.createIdentifier('from')
          )],
          ts.NodeFlags.Let
        ),
        ts.factory.createBinaryExpression(
          ts.factory.createIdentifier('i'),
          ts.SyntaxKind.LessThanToken,
          ts.factory.createIdentifier('to')
        ),
        ts.factory.createPostfixUnaryExpression(
          ts.factory.createIdentifier('i'),
          ts.SyntaxKind.PlusPlusToken
        ),
        ts.factory.createExpressionStatement(
          ts.factory.createBinaryExpression(
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier('array'),
              ts.factory.createIdentifier('i')
            ),
            ts.SyntaxKind.EqualsToken,
            ts.factory.createIdentifier('value')
          )
        )
      ),
      ts.factory.createReturnStatement(ts.factory.createIdentifier('array'))
    ])
  );
}