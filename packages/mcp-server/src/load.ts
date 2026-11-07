/**
 * Подготавливает BS-скрипт из шаблона, подставляя параметры.
 *
 * Шаблон использует `${key}` внутри строковых литералов в одинарных кавычках.
 * Подстановка выполняется за один проход: содержимое параметров не является
 * шаблоном. Экранирование использует ECMAScript string escapes; совместимость
 * редких управляющих символов с C-runtime требует отдельной native проверки.
 *
 * @param template - содержимое .bs файла с плейсхолдерами `${key}`
 * @param params   - словарь подстановок
 * @returns готовый BS-скрипт для передачи в evaluator.eval()
 */
export function buildScript(template: string, params: Record<string, string>): string {
  return template.replace(/\$\{([^}]+)\}/g, (placeholder: string, key: string) => {
    if (!Object.hasOwn(params, key)) return placeholder;

    return JSON.stringify(params[key])
      .slice(1, -1)
      .replace(/'/g, "\\'")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  });
}
