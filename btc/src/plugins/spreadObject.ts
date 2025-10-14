import { PluginObj, PluginPass, types as t } from '@babel/core';

interface ObjectSpreadToObjectUnionState extends PluginPass {
  needsObjectUnion?: boolean;
}

export default function transformObjectSpreadToObjectUnionPlugin(): PluginObj<ObjectSpreadToObjectUnionState> {
  return {
    name: 'transform-object-spread-to-object-union',
    pre() {
      this.needsObjectUnion = false;
    },
    visitor: {
      Program: {
        exit(path, state) {
          if (state.needsObjectUnion) {
            // Вставляем определение функции ObjectUnion в начало программы
            const functionDecl = t.functionDeclaration(
              t.identifier('ObjectUnion'),
              [t.identifier('obj1'), t.identifier('obj2')],
              t.blockStatement([
                t.variableDeclaration('var', [
                  t.variableDeclarator(t.identifier('newObject'), t.objectExpression([]))
                ]),
                t.variableDeclaration('var', [
                  t.variableDeclarator(t.identifier('key'))
                ]),
                t.forInStatement(
                  t.identifier('key'),
                  t.identifier('obj1'),
                  t.blockStatement([
                    t.expressionStatement(
                      t.callExpression(
                        t.memberExpression(t.identifier('newObject'), t.identifier('SetProperty')),
                        [
                          t.identifier('key'),
                          t.callExpression(
                            t.memberExpression(t.identifier('obj1'), t.identifier('GetProperty')),
                            [t.identifier('key')]
                          )
                        ]
                      )
                    )
                  ])
                ),
                t.forInStatement(
                  t.identifier('key'),
                  t.identifier('obj2'),
                  t.blockStatement([
                    t.expressionStatement(
                      t.callExpression(
                        t.memberExpression(t.identifier('newObject'), t.identifier('SetProperty')),
                        [
                          t.identifier('key'),
                          t.callExpression(
                            t.memberExpression(t.identifier('obj2'), t.identifier('GetProperty')),
                            [t.identifier('key')]
                          )
                        ]
                      )
                    )
                  ])
                ),
                t.returnStatement(t.identifier('newObject'))
              ])
            );
            path.unshiftContainer('body', functionDecl);
          }
        }
      },
      ObjectExpression(path, state) {
        // Проверяем наличие spread-элементов в объекте
        const hasSpread = path.node.properties.some(
          property => t.isSpreadElement(property)
        );

        if (!hasSpread) {
          return; // Пропускаем объекты без spread-элементов
        }

        state.needsObjectUnion = true;

        const parts: t.Expression[] = [];
        let currentLiteralProperties: t.ObjectMember[] = [];

        // Обрабатываем свойства объекта
        path.node.properties.forEach(property => {
          if (t.isSpreadElement(property)) {
            // Если есть накопленные свойства, добавляем их как объект
            if (currentLiteralProperties.length > 0) {
              parts.push(t.objectExpression(currentLiteralProperties));
              currentLiteralProperties = [];
            }
            // Добавляем аргумент spread-элемента
            parts.push(property.argument);
          } else {
            // Собираем не-spread свойства (с кастом к t.ObjectMember)
            currentLiteralProperties.push(property as t.ObjectMember);
          }
        });

        // Добавляем оставшиеся свойства как объект
        if (currentLiteralProperties.length > 0) {
          parts.push(t.objectExpression(currentLiteralProperties));
        }

        // Если частей нет, возвращаем пустой объект
        if (parts.length === 0) {
          path.replaceWith(t.objectExpression([]));
          return;
        }

        // Если только одна часть, заменяем на нее
        if (parts.length === 1) {
          // path.replaceWith(parts[0]);
          path.replaceWith(t.callExpression(
            t.identifier('ObjectUnion'),
            [t.objectExpression([]), parts[0]]
          ));
          return;
        }

        // Строим вложенные вызовы ObjectUnion попарно (left-associative)
        let expression: t.Expression = parts[0];
        for (let i = 1; i < parts.length; i++) {
          expression = t.callExpression(
            t.identifier('ObjectUnion'),
            [expression, parts[i]]
          );
        }

        // Заменяем выражение объекта вложенными вызовами ObjectUnion
        path.replaceWith(expression);
      }
    }
  };
}