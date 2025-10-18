import path from "path";

type Options = {
  sourceMaps?: boolean;
  cwd: string;
}

export function createConfig(options: Options) {
  return {
    presets: [
      [
        require.resolve("@babel/preset-env"),
        {
          targets: "defaults",
          modules: false
        }
      ]
    ],
    plugins: [
      // Трансформирует числовые литералы с разделителями (например, 1_000_000 -> 1000000)
      require.resolve("@babel/plugin-transform-numeric-separator"),

      // TODO: что это такое вообще
      // require.resolve("@babel/plugin-transform-logical-assignment-operators"),

      // Реализует оператор нулевого слияния (??)
      require.resolve("@babel/plugin-transform-nullish-coalescing-operator"),

      // TODO: реализовать по другому
      require.resolve("@babel/plugin-transform-optional-chaining"),

      // TODO: у нас нет Math.pow, надо проверить
      require.resolve("@babel/plugin-transform-exponentiation-operator"),

      // Преобразует шаблонные строки в конкатенацию строк
      [require.resolve("@babel/plugin-transform-template-literals"), { "loose": true }],

      // TODO: что это такое вообще
      // require.resolve("@babel/plugin-transform-literals"),

      // TODO: в BS нельзя анонимные функции
      require.resolve("@babel/plugin-transform-function-name"),

      // TODO: в BS нельзя анонимные функции
      require.resolve("@babel/plugin-transform-arrow-functions"),

      // Преобразует сокращенные свойства объектов в полные
      require.resolve("@babel/plugin-transform-shorthand-properties"),

      // Преобразует циклы for-of в циклы for-in
      path.resolve(__dirname, "../plugins/forOfToForIn.js"),

      // TODO: не уверен как ведет себя BS и нотацией \u и когда литерал вставлен напрямую
      require.resolve("@babel/plugin-transform-unicode-escapes"),

      // Реализует оператор расширения для массивов
      path.resolve(__dirname, "../plugins/spreadArray.js"),

      // Реализует оператор расширения для объектов
      path.resolve(__dirname, "../plugins/spreadObject.js"),

      // Реализует деструктуризацию объектов и массивов
      path.resolve(__dirname, "../plugins/destructuring.js"),

      // Заменяет let/const на var с учетом области видимости
      require.resolve("@babel/plugin-transform-block-scoping"),

      // Заменяет знак доллара в идентификаторах на разрешнные символы (например, $ -> _24_)
      path.resolve(__dirname, "../plugins/replaceDollar.js"),

      // Поднимает переменные из циклов перед ними
      path.resolve(__dirname, "../plugins/loopHoistVariables.js"),

      // Удаляет импорты, экспорты по умолчанию и модификаторы экспортов
      path.resolve(__dirname, "../plugins/removeImportExport.js")
    ],
    sourceMaps: options.sourceMaps,
    cwd: options.cwd,
  }
}