// import * as ts from "typescript";

// export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
//   return (context: ts.TransformationContext) => (file: ts.SourceFile) => {
//     let tempCounter = 0;
//     const propNames: Set<string> = new Set();
//     const tempDeclarations: ts.VariableDeclaration[] = [];

//     const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
//       // Handle PropertyAccessExpression
//       if (ts.isPropertyAccessExpression(node)) {
//         // Если это вызов метода (obj.method(...)) → не трансформируем и не добавляем в propNames
//         if (node.parent && ts.isCallExpression(node.parent) && node.parent.expression === node) {
//           return node;
//         }

//         // Иначе добавляем property-имя
//         propNames.add(node.name.text);

//         // Обходим base-часть
//         const base = ts.visitNode(node.expression, visitor) as ts.Expression;
//         const property = ts.factory.createStringLiteral(node.name.text);

//         if (node.questionDotToken) {
//           // Handle optional chaining
//           const temp = ts.factory.createIdentifier(`_tmp${tempCounter++}`);
//           tempDeclarations.push(
//             ts.factory.createVariableDeclaration(temp, undefined, undefined, undefined)
//           );
//           const assigned = ts.factory.createAssignment(temp, base);
//           const nullCheck = ts.factory.createBinaryExpression(
//             assigned,
//             ts.factory.createToken(ts.SyntaxKind.EqualsEqualsToken),
//             ts.factory.createNull()
//           );
//           const undefinedCheck = ts.factory.createBinaryExpression(
//             temp,
//             ts.factory.createToken(ts.SyntaxKind.EqualsEqualsToken),
//             ts.factory.createIdentifier("undefined")
//           );
//           const combinedCheck = ts.factory.createBinaryExpression(
//             nullCheck,
//             ts.factory.createToken(ts.SyntaxKind.BarBarToken),
//             undefinedCheck
//           );
//           const whenTrue = ts.factory.createIdentifier("undefined");
//           const whenFalse = ts.factory.createCallExpression(
//             ts.factory.createIdentifier("__bt_tt_getProp"),
//             undefined,
//             [temp, property]
//           );
//           return ts.factory.createConditionalExpression(
//             combinedCheck,
//             undefined,
//             whenTrue,
//             undefined,
//             whenFalse
//           );
//         }

//         // Non-optional: direct call to helper function
//         return ts.factory.createCallExpression(
//           ts.factory.createIdentifier("__bt_tt_getProp"),
//           undefined,
//           [base, property]
//         );
//       }

//       // Continue visiting other nodes
//       return ts.visitEachChild(node, visitor, context);
//     };

//     // Visit the entire file to collect property names and transform nodes
//     const transformedFile = ts.visitNode(file, visitor) as ts.SourceFile;

//     // Generate helper function
//     const helperFunc = ts.factory.createFunctionDeclaration(
//       undefined,
//       undefined,
//       ts.factory.createIdentifier("__bt_tt_getProp"),
//       undefined,
//       [
//         ts.factory.createParameterDeclaration(undefined, undefined, "obj"),
//         ts.factory.createParameterDeclaration(undefined, undefined, "prop"),
//       ],
//       undefined,
//       ts.factory.createBlock([
//         // if (DataType(obj) === "object") { return GetOptObjectProperty(obj, prop); }
//         ts.factory.createIfStatement(
//           ts.factory.createBinaryExpression(
//             ts.factory.createCallExpression(
//               ts.factory.createIdentifier("DataType"),
//               undefined,
//               [ts.factory.createIdentifier("obj")]
//             ),
//             ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
//             ts.factory.createStringLiteral("object")
//           ),
//           ts.factory.createBlock([
//             ts.factory.createReturnStatement(
//               ts.factory.createCallExpression(
//                 ts.factory.createIdentifier("GetOptObjectProperty"),
//                 undefined,
//                 [ts.factory.createIdentifier("obj"), ts.factory.createIdentifier("prop")]
//               )
//             ),
//           ])
//         ),
//         // var returnValue;
//         ts.factory.createVariableStatement(
//           undefined,
//           ts.factory.createVariableDeclarationList(
//             [ts.factory.createVariableDeclaration("returnValue", undefined, undefined, undefined)],
//             ts.NodeFlags.None
//           )
//         ),
//         // Generated if-else for each property
//         ...Array.from(propNames).map((prop, index) => {
//           const condition = ts.factory.createBinaryExpression(
//             ts.factory.createIdentifier("prop"),
//             ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
//             ts.factory.createStringLiteral(prop)
//           );
//           const tryBlock = ts.factory.createBlock([
//             ts.factory.createExpressionStatement(
//               ts.factory.createAssignment(
//                 ts.factory.createIdentifier("returnValue"),
//                 ts.factory.createPropertyAccessExpression(
//                   ts.factory.createIdentifier("obj"),
//                   prop
//                 )
//               )
//             ),
//           ]);
//           const catchClause = ts.factory.createCatchClause(
//             ts.factory.createVariableDeclaration("e"),
//             ts.factory.createBlock([])
//           );
//           return ts.factory.createIfStatement(
//             condition,
//             ts.factory.createBlock([
//               ts.factory.createTryStatement(tryBlock, catchClause, undefined),
//               ts.factory.createReturnStatement(ts.factory.createIdentifier("returnValue")),
//             ]),
//             index < propNames.size - 1
//               ? undefined
//               : ts.factory.createReturnStatement(ts.factory.createIdentifier("undefined"))
//           );
//         }),
//         // Final return undefined (if no properties match and no else branch)
//         ...(propNames.size > 0
//           ? []
//           : [ts.factory.createReturnStatement(ts.factory.createIdentifier("undefined"))]),
//       ])
//     );

//     // Create variable statement for _tmp variables
//     const varStatement =
//       tempDeclarations.length > 0
//         ? [
//             ts.factory.createVariableStatement(
//               undefined,
//               ts.factory.createVariableDeclarationList(tempDeclarations, ts.NodeFlags.Let)
//             ),
//           ]
//         : [];

//     // Update source file with helper function and variable declarations
//     return ts.factory.updateSourceFile(transformedFile, [
//       helperFunc,
//       ...varStatement,
//       ...transformedFile.statements,
//     ]);
//   };
// }
