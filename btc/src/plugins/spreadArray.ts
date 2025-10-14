import { PluginObj, PluginPass, types as t } from '@babel/core';

interface ArraySpreadToArrayUnionState extends PluginPass {
  // Пустой интерфейс для возможных будущих расширений
}

export default function transformArraySpreadToArrayUnionPlugin(): PluginObj<ArraySpreadToArrayUnionState> {
  return {
    name: 'transform-array-spread-to-array-union',
    visitor: {
      ArrayExpression(path) {
        // Проверяем наличие spread-элементов в массиве
        const hasSpread = path.node.elements.some(
          element => element && t.isSpreadElement(element)
        );

        if (!hasSpread) {
          return; // Пропускаем массивы без spread-элементов
        }

        const args: t.Expression[] = [];
        let currentLiteralArray: (t.Expression | null)[] = [];

        // Обрабатываем элементы массива
        path.node.elements.forEach(element => {
          if (element && t.isSpreadElement(element)) {
            // Если есть накопленные литералы, добавляем их как массив
            if (currentLiteralArray.length > 0) {
              args.push(t.arrayExpression(currentLiteralArray));
              currentLiteralArray = [];
            }
            // Добавляем аргумент spread-элемента
            args.push(element.argument);
          } else {
            // Собираем не-spread элементы (t.Expression | null)
            currentLiteralArray.push(element as t.Expression);
          }
        });

        // Добавляем оставшиеся литералы как массив
        if (currentLiteralArray.length > 0) {
          args.push(t.arrayExpression(currentLiteralArray));
        }

        // Заменяем выражение массива вызовом ArrayUnion
        path.replaceWith(
          t.callExpression(t.identifier('ArrayUnion'), args)
        );
      }
    }
  };
}