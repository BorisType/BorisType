/**
 * Interactive UI для platform objects pull.
 *
 * Показывает summary, таблицу изменений, checkbox-выбор,
 * package assignment для новых объектов.
 *
 * @module objects/interactive
 */

import { checkbox, select } from "@inquirer/prompts";
import { logger } from "../logger.js";
import type { ChangeSet, ObjectChange, SelectedObject, SelectionResult } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Проверяет, является ли ошибка результатом Ctrl+C / Escape в inquirer prompt.
 *
 * @param err - Пойманная ошибка
 * @returns true если пользователь прервал ввод
 */
function isPromptCancelled(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "ExitPromptError" || err.message.includes("User force closed");
  }
  return false;
}

// ─── Types ──────────────────────────────────────────────────────

/**
 * Опции для interactive/non-interactive selection.
 */
export type PromptSelectionOptions = {
  /** Non-interactive: принять все ours автоматически */
  all?: boolean;
  /** Пакет по умолчанию для новых объектов (--assign-to) */
  assignTo?: string;
};

// ─── Formatting Helpers ─────────────────────────────────────────

/**
 * Минимальные ширины колонок (символов).
 * Если терминал широкий — колонки растягиваются пропорционально.
 */
const MIN_COL = { id: 19, code: 12, name: 20, type: 14, modified: 20, status: 10 } as const;

/**
 * Максимальные ширины колонок (символов).
 * Колонки не растягиваются шире этого значения.
 */
const MAX_COL = { id: 19 } as const;

/**
 * Пропорции колонок для распределения свободного места.
 * name получает больше всего доп. ширины.
 */
const COL_WEIGHT = { id: 1, code: 1, name: 3, type: 1, modified: 0, status: 0 } as const;

/**
 * Вычисляет ширины колонок на основе текущей ширины терминала.
 *
 * @returns Объект с вычисленными ширинами
 */
function computeColWidths(): Record<string, number> {
  const termWidth = process.stdout.columns || 120;
  // Overhead: "  " prefix (2) + star+space (2) + spaces between 7 cols (7) + "Package" label (~10)
  const overhead = 2 + 2 + 7 + 10;
  const minTotal = MIN_COL.id + MIN_COL.code + MIN_COL.name + MIN_COL.type + MIN_COL.modified + MIN_COL.status;
  const available = Math.max(0, termWidth - overhead - minTotal);
  const totalWeight = COL_WEIGHT.id + COL_WEIGHT.code + COL_WEIGHT.name + COL_WEIGHT.type + COL_WEIGHT.modified + COL_WEIGHT.status;

  const extra = (key: keyof typeof COL_WEIGHT) => (totalWeight > 0 ? Math.floor((available * COL_WEIGHT[key]) / totalWeight) : 0);

  return {
    id: Math.min(MIN_COL.id + extra("id"), MAX_COL.id),
    code: MIN_COL.code + extra("code"),
    name: MIN_COL.name + extra("name"),
    type: MIN_COL.type + extra("type"),
    modified: MIN_COL.modified + extra("modified"),
    status: MIN_COL.status + extra("status"),
  };
}

/**
 * Обрезает строку до maxLen символов с многоточием в середине.
 * Если строка помещается — возвращает как есть.
 *
 * @example truncateMiddle("очень длинная строка", 15) → "очень ...строка"
 *
 * @param str - Исходная строка
 * @param maxLen - Максимальная длина
 * @returns Обрезанная строка
 */
function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const ellipsis = "...";
  const available = maxLen - ellipsis.length;
  const headLen = Math.ceil(available / 2);
  const tailLen = Math.floor(available / 2);
  return str.slice(0, headLen) + ellipsis + str.slice(str.length - tailLen);
}

/**
 * Форматирует строку: обрезает + pad до нужной ширины.
 *
 * @param value - Значение
 * @param width - Ширина колонки
 * @returns Форматированная строка
 */
function col(value: string, width: number): string {
  return truncateMiddle(value, width).padEnd(width);
}

/**
 * Форматирует дату: убирает T и таймзону.
 * "2026-04-01T15:30:00+03:00" → "2026-04-01 15:30:00"
 *
 * @param dateStr - ISO 8601 дата
 * @returns Форматированная дата
 */
function formatDate(dateStr: string): string {
  return dateStr
    .replace("T", " ")
    .replace(/[+-]\d{2}:\d{2}$/, "")
    .replace(/Z$/, "");
}

// ─── Summary ────────────────────────────────────────────────────

/**
 * Выводит summary статистики перед интерактивным UI.
 *
 * @param changeSet - Результат processing
 * @param totalFetched - Общее число скачанных объектов
 */
export function printSummary(changeSet: ChangeSet, totalFetched: number): void {
  const newCount = changeSet.changes.filter((c) => c.status === "new").length;
  const modifiedCount = changeSet.changes.filter((c) => c.status === "modified").length;

  console.log();
  logger.info(`Fetched ${totalFetched} objects from server.`);
  logger.info(`  Filtered by type: ${changeSet.filteredByTypeCount} excluded`);
  logger.info(`  Unchanged (volatile fields only): ${changeSet.unchanged.length}`);
  if (changeSet.deleted.length > 0) {
    logger.info(`  Deleted on server: ${changeSet.deleted.length} (will remove local files)`);
  }
  logger.info(`  Real changes: ${changeSet.changes.length} (${newCount} new, ${modifiedCount} modified)`);
  console.log();
}

// ─── Table Formatting ───────────────────────────────────────────

/**
 * Форматирует ObjectChange в строку для checkbox choice.
 *
 * Колонки: ★ ID code name type modified status package
 *
 * @param change - Объект изменения
 * @param w - Вычисленные ширины колонок
 * @returns Форматированная строка
 */
function formatChangeLabel(change: ObjectChange, w: Record<string, number>): string {
  const star = change.ownership === "ours" ? "★" : " ";
  const id = col(change.metadata.id, w.id);
  const code = col(change.metadata.code || "—", w.code);
  const name = col(change.metadata.name || "—", w.name);
  const type = col(change.metadata.type, w.type);
  const date = col(formatDate(change.metadata.modifiedDate), w.modified);
  const status = col(change.status, w.status);
  const pkg = change.existingPackage ?? "—";

  return `${star} ${id} ${code} ${name} ${type} ${date} ${status} ${pkg}`;
}

/**
 * Выводит заголовок таблицы.
 *
 * @param w - Вычисленные ширины колонок
 */
function printTableHeader(w: Record<string, number>): void {
  const header =
    `  ${"".padEnd(3)} ` +
    `${"ID".padEnd(w.id)} ` +
    `${"Code".padEnd(w.code)} ` +
    `${"Name".padEnd(w.name)} ` +
    `${"Type".padEnd(w.type)} ` +
    `${"Modified".padEnd(w.modified)} ` +
    `${"Status".padEnd(w.status)} ` +
    `Package`;

  const separator =
    `  ${"─".repeat(3)} ` +
    `${"─".repeat(w.id)} ` +
    `${"─".repeat(w.code)} ` +
    `${"─".repeat(w.name)} ` +
    `${"─".repeat(w.type)} ` +
    `${"─".repeat(w.modified)} ` +
    `${"─".repeat(w.status)} ` +
    `${"─".repeat(10)}`;

  console.log(header);
  console.log(separator);
}

// ─── Interactive Selection ──────────────────────────────────────

/**
 * Интерактивный выбор объектов для pull.
 *
 * Показывает checkbox list с pre-selected "ours" объектами.
 * После выбора запрашивает package assignment для новых объектов.
 * Ctrl+C корректно прерывает выбор.
 *
 * @param changeSet - Результат processing
 * @returns Результат выбора: selected + skipped, или null если Ctrl+C
 */
async function selectObjectsInteractive(changeSet: ChangeSet): Promise<SelectionResult | null> {
  if (changeSet.changes.length === 0) {
    logger.info("No changes to select.");
    return { selected: [], skipped: [] };
  }

  const w = computeColWidths();
  printTableHeader(w);

  const choices = changeSet.changes.map((change) => ({
    name: formatChangeLabel(change, w),
    value: change,
    checked: change.ownership === "ours",
  }));

  let selected: ObjectChange[];
  try {
    selected = await checkbox<ObjectChange>({
      message: "Select objects to pull (★ = ours by author)",
      choices,
      pageSize: 20,
      theme: {
        style: {
          renderSelectedChoices: (selectedChoices: ReadonlyArray<unknown>) => `${selectedChoices.length} object(s)`,
        },
      },
    });
  } catch (err) {
    if (isPromptCancelled(err)) {
      return null;
    }
    throw err;
  }

  const selectedSet = new Set(selected.map((c) => c.metadata.id));
  const skipped = changeSet.changes.filter((c) => !selectedSet.has(c.metadata.id));

  // Package assignment для новых объектов
  const result: SelectedObject[] = [];

  for (const change of selected) {
    let targetPackage: string | null;
    try {
      targetPackage = await resolveTargetPackage(change, changeSet.availablePackages);
    } catch (err) {
      if (isPromptCancelled(err)) {
        return null;
      }
      throw err;
    }

    if (targetPackage !== null) {
      result.push({ change, targetPackage });
    } else {
      skipped.push(change);
    }
  }

  return { selected: result, skipped };
}

// ─── Package Assignment ─────────────────────────────────────────

/**
 * Определяет целевой пакет для объекта.
 *
 * - modified → используем existingPackage
 * - new + single-package → единственный пакет
 * - new + multi-package → interactive select
 *
 * @param change - Объект изменения
 * @param availablePackages - Доступные пакеты
 * @returns Имя целевого пакета или null (skip)
 */
async function resolveTargetPackage(change: ObjectChange, availablePackages: string[]): Promise<string | null> {
  // Modified — пакет уже известен
  if (change.existingPackage) {
    return change.existingPackage;
  }

  // Single-package — без выбора
  if (availablePackages.length === 1) {
    return availablePackages[0];
  }

  // Multi-package — interactive
  const name = change.metadata.name || change.metadata.id;

  const packageChoices = [...availablePackages.map((pkg) => ({ name: pkg, value: pkg })), { name: "(skip)", value: null as string | null }];

  return select<string | null>({
    message: `Assign "${name}" (${change.metadata.type}) to package:`,
    choices: packageChoices,
  });
}

// ─── Non-Interactive (--all) ────────────────────────────────────

/**
 * Non-interactive выбор: все ours объекты автоматически.
 *
 * @param changeSet - Результат processing
 * @param defaultPackage - Пакет для новых объектов (default: первый available)
 * @returns Результат выбора
 */
function selectObjectsAll(changeSet: ChangeSet, defaultPackage?: string): SelectionResult {
  const targetPackage = defaultPackage ?? changeSet.availablePackages[0];
  const selected: SelectedObject[] = [];
  const skipped: ObjectChange[] = [];

  for (const change of changeSet.changes) {
    if (change.ownership === "ours") {
      const pkg = change.existingPackage ?? targetPackage;
      selected.push({ change, targetPackage: pkg });
    } else {
      skipped.push(change);
    }
  }

  return { selected, skipped };
}

// ─── Main Entry Point ───────────────────────────────────────────

/**
 * Главная точка входа для выбора объектов.
 *
 * Выбирает между interactive и non-interactive режимом.
 *
 * @param changeSet - Результат processing (Phase 3)
 * @param totalFetched - Общее число скачанных объектов (для summary)
 * @param options - Опции режима работы
 * @returns Результат выбора: selected + skipped
 */
export async function promptObjectSelection(
  changeSet: ChangeSet,
  totalFetched: number,
  options: PromptSelectionOptions = {},
): Promise<SelectionResult> {
  printSummary(changeSet, totalFetched);

  if (changeSet.changes.length === 0) {
    logger.success("Everything is up to date.");
    return { selected: [], skipped: [] };
  }

  if (options.all) {
    const result = selectObjectsAll(changeSet, options.assignTo);
    logger.info(`Auto-selected ${result.selected.length} ours object(s), skipped ${result.skipped.length} theirs.`);
    return result;
  }

  const result = await selectObjectsInteractive(changeSet);

  if (result === null) {
    logger.warning("\nAborted by user.");
    return { selected: [], skipped: changeSet.changes };
  }

  return result;
}
