/**
 * Подготавливает BS-скрипт из шаблона, подставляя параметры.
 *
 * Шаблон использует `${key}` для интерполяции. Значения экранируются
 * для безопасной вставки в BS-строковые литералы (одинарные кавычки).
 *
 * @param template - содержимое .bs файла с плейсхолдерами `${key}`
 * @param params   - словарь подстановок
 * @returns готовый BS-скрипт для передачи в evaluator.eval()
 */
export function buildScript(template: string, params: Record<string, string>): string {
  let script = template;

  for (const [key, value] of Object.entries(params)) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    script = script.replaceAll(`\${${key}}`, escaped);
  }

  return script;
}
