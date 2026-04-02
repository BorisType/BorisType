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
  logger.info(`  Filtered by type: ${changeSet.filteredByType.length} excluded`);
  logger.info(`  Unchanged (volatile fields only): ${changeSet.unchanged.length}`);
  logger.info(`  Real changes: ${changeSet.changes.length} (${newCount} new, ${modifiedCount} modified)`);
  console.log();
}

// ─── Formatting ─────────────────────────────────────────────────

/**
 * Форматирует ObjectChange в строку для checkbox choice.
 *
 * @param change - Объект изменения
 * @returns Форматированная строка
 */
function formatChangeLabel(change: ObjectChange): string {
  const star = change.ownership === "ours" ? "★" : " ";
  const name = change.metadata.name || change.metadata.id;
  const type = change.metadata.type;
  const date = change.metadata.modifiedDate;
  const status = change.status;
  const pkg = change.existingPackage ?? "—";

  return `${star} ${name.padEnd(30)} ${type.padEnd(16)} ${date.padEnd(20)} ${status.padEnd(10)} ${pkg}`;
}

// ─── Interactive Selection ──────────────────────────────────────

/**
 * Интерактивный выбор объектов для pull.
 *
 * Показывает checkbox list с pre-selected "ours" объектами.
 * После выбора запрашивает package assignment для новых объектов.
 *
 * @param changeSet - Результат processing
 * @returns Результат выбора: selected + skipped
 */
async function selectObjectsInteractive(changeSet: ChangeSet): Promise<SelectionResult> {
  if (changeSet.changes.length === 0) {
    logger.info("No changes to select.");
    return { selected: [], skipped: [] };
  }

  // Header
  console.log(`  ${"".padEnd(3)} ${"Name".padEnd(30)} ${"Type".padEnd(16)} ${"Modified".padEnd(20)} ${"Status".padEnd(10)} ${"Package"}`);
  console.log(`  ${"─".repeat(3)} ${"─".repeat(30)} ${"─".repeat(16)} ${"─".repeat(20)} ${"─".repeat(10)} ${"─".repeat(10)}`);

  const choices = changeSet.changes.map((change) => ({
    name: formatChangeLabel(change),
    value: change,
    checked: change.ownership === "ours",
  }));

  const selected = await checkbox<ObjectChange>({
    message: "Select objects to pull (★ = ours by author)",
    choices,
    pageSize: 20,
  });

  const selectedSet = new Set(selected.map((c) => c.metadata.id));
  const skipped = changeSet.changes.filter((c) => !selectedSet.has(c.metadata.id));

  // Package assignment для новых объектов
  const result: SelectedObject[] = [];

  for (const change of selected) {
    const targetPackage = await resolveTargetPackage(change, changeSet.availablePackages);
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

  return selectObjectsInteractive(changeSet);
}
