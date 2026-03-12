/**
 * Module Access Helpers — доступ к модульным переменным и хелперам через __env
 *
 * @module lowering/expressions/module-access
 */

import { IR, type IRExpression } from "../../ir/index.ts";
import type { VisitorContext } from "../visitor.ts";
import { resolveModuleLevelAccess } from "../env-resolution.ts";

/**
 * Строит ссылку на переменную импортированного модуля (__module_X) через __env цепочку.
 *
 * Если какой-либо именованный импорт из модуля используется во вложенной функции
 * (isCaptured), переменная `__module_X` записывается в __env на уровне модуля.
 * Доступ к ней из вложенных функций осуществляется через __env.__parent цепочку,
 * аналогично обычным captured-переменным.
 *
 * @param moduleVar - Имя переменной модуля (например "__module___utils")
 * @param isCapturedImport - Является ли этот импорт captured (используется во вложенной функции)
 * @param ctx - Текущий VisitorContext
 * @returns IR выражение: прямой IR.id(moduleVar) или __env[.__parent...].moduleVar
 */
export function importModuleVarAccess(
  moduleVar: string,
  isCapturedImport: boolean,
  ctx: VisitorContext,
): IRExpression {
  if (!isCapturedImport) {
    return IR.id(moduleVar);
  }

  // Captured import: доступ через __env цепочку до module scope
  return resolveModuleLevelAccess(moduleVar, ctx);
}

/**
 * Строит ссылку на helper-функцию через цепочку __env.__parent.
 *
 * Хелперы (__ImportMeta_*, __AbsoluteUrl) зарегистрированы в top-level __env
 * (moduleScope). Если текущий код — внутри вложенной функции, нужно
 * пройти цепочку __parent до module-level __env.
 *
 * @param helperName - Имя хелпера (например "__ImportMeta_dirUrl")
 * @param ctx - Текущий VisitorContext
 * @returns IR выражение вида __env.__ImportMeta_dirUrl или __env.__parent.__ImportMeta_dirUrl
 */
export function helperEnvAccess(helperName: string, ctx: VisitorContext): IRExpression {
  return resolveModuleLevelAccess(helperName, ctx);
}
