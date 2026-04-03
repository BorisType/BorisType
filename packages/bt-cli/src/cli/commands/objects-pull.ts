/**
 * Команда `btc objects pull`.
 *
 * Связывает фазы 2–5 в единый pipeline.
 * Если нет кэша — требует `--since`, иначе ошибка.
 * Вся бизнес-логика — в core/objects/*.
 *
 * @module cli/commands/objects-pull
 */

import { execSync } from "node:child_process";
import { WshcmClient } from "@boristype/ws-client";
import { logger } from "../../core/logger.js";
import { getBTConfig } from "../../core/config.js";
import { resolvePackagesToLink } from "../../core/linking/index.js";
import { resolvePushConnectionOptions } from "../../core/pushing/index.js";
import { pullAllObjects } from "../../core/objects/server-query.js";
import { processObjects } from "../../core/objects/processing.js";
import { promptObjectSelection } from "../../core/objects/interactive.js";
import { writeObjectFiles, printWriteSummary } from "../../core/objects/file-writer.js";
import { loadObjectsCache, updateObjectsCache } from "../../core/objects/cache.js";

// ─── Types ──────────────────────────────────────────────────────

/**
 * Опции CLI для команды `btc objects pull`.
 */
export type ObjectsPullCommandOptions = {
  /** Non-interactive: принять все ours автоматически */
  all?: boolean;
  /** Пакет по умолчанию для новых объектов */
  assignTo?: string;
  /** Override last sync date (ISO 8601 | "today" | "git" | commit hash) */
  since?: string;
  /** Server host */
  host?: string;
  /** Server port */
  port?: number;
  /** Username */
  username?: string;
  /** Password */
  password?: string;
  /** Use HTTPS */
  https?: boolean;
};

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Определяет имена пакетов для objects sync.
 * Использует resolvePackagesToLink как single source of truth.
 *
 * @param cwd - Рабочая директория проекта
 * @returns Массив имён пакетов
 */
function resolvePackageNames(cwd: string): string[] {
  const packages = resolvePackagesToLink(cwd);
  return packages.map((p) => p.name);
}

/**
 * Получает дату коммита git по ref (HEAD, commit hash, etc).
 *
 * @param cwd - Рабочая директория
 * @param ref - Git ref (по умолчанию HEAD)
 * @returns ISO 8601 дата коммита
 * @throws Error если git недоступен или ref не найден
 */
function getGitCommitDate(cwd: string, ref: string = "HEAD"): string {
  const result = execSync(`git log -1 --format=%cI ${ref}`, { cwd, encoding: "utf-8" }).trim();
  if (!result) {
    throw new Error(`Could not get commit date for ref "${ref}"`);
  }
  return result;
}

/**
 * Резолвит значение `--since` в ISO 8601 дату.
 *
 * Поддерживаемые форматы:
 * - `"today"` → сегодня 00:00:00 UTC
 * - `"git"` → дата последнего git коммита (HEAD)
 * - 7-40 hex символов → git commit hash → дата этого коммита
 * - Всё остальное → ISO 8601 дата как есть
 *
 * @param value - Значение из CLI
 * @param cwd - Рабочая директория
 * @returns ISO 8601 дата
 */
function resolveSinceValue(value: string, cwd: string): string {
  if (value === "today") {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today.toISOString();
  }

  if (value === "git") {
    return getGitCommitDate(cwd);
  }

  // Git commit hash (7-40 hex chars)
  if (/^[0-9a-f]{7,40}$/i.test(value)) {
    return getGitCommitDate(cwd, value);
  }

  // ISO 8601 date as-is
  return value;
}

// ─── Shared Pipeline ────────────────────────────────────────────

/**
 * Общий pipeline для init и pull.
 *
 * @param cwd - Рабочая директория
 * @param sinceDate - ISO 8601 дата начала
 * @param cliOptions - Опции CLI
 */
async function executePullPipeline(cwd: string, sinceDate: string, cliOptions: ObjectsPullCommandOptions): Promise<void> {
  const btconfig = getBTConfig(cwd);
  const connectionOptions = resolvePushConnectionOptions(cwd, cliOptions);
  const excludeTypes = btconfig?.objects?.exclude;
  const packageNames = resolvePackageNames(cwd);

  // Connect
  logger.info(`Connecting to ${connectionOptions.https ? "https" : "http"}://${connectionOptions.host}:${connectionOptions.port}...`);

  const client = new WshcmClient({
    overHttps: connectionOptions.https,
    host: connectionOptions.host,
    port: connectionOptions.port,
    username: connectionOptions.username,
    password: connectionOptions.password,
  });
  await client.initialize();

  const evaluator = client.createEvaluator();
  await evaluator.initialize();

  try {
    logger.info(`Fetching objects modified since ${sinceDate}...`);

    const fetched = await pullAllObjects(evaluator, sinceDate, (done, total) => {
      process.stdout.write(`\r  Fetching objects... [${done}/${total}]`);
    });

    if (fetched.length > 0) {
      process.stdout.write("\n");
    }

    if (fetched.length === 0) {
      logger.success("No modified objects found on server.");
      return;
    }

    // Process
    const changeSet = processObjects(fetched, {
      excludeTypes,
      username: connectionOptions.username,
      cwd,
      packages: packageNames,
    });

    // Interactive / auto selection
    const selection = await promptObjectSelection(changeSet, fetched.length, {
      all: cliOptions.all,
      assignTo: cliOptions.assignTo,
    });

    if (selection.selected.length === 0) {
      logger.info("No objects selected. Nothing to write.");
      return;
    }

    // Write files
    const written = writeObjectFiles(cwd, selection.selected);

    // Update cache
    const typeMap: Record<string, string> = {};
    const packageMap: Record<string, string> = {};
    for (const { change, targetPackage } of selection.selected) {
      typeMap[change.metadata.id] = change.metadata.type;
      packageMap[change.metadata.id] = targetPackage;
    }
    updateObjectsCache(cwd, written, typeMap, packageMap);

    // Summary
    printWriteSummary(written);
  } finally {
    await evaluator.close();
  }
}

// ─── Command ────────────────────────────────────────────────────

/**
 * Команда `btc objects pull`.
 *
 * Использует lastSync из кэша.
 * Если кэша нет — требует `--since`, иначе ошибка.
 * `--since` всегда переопределяет кэш.
 *
 * @param cliOptions - Опции из CLI
 */
export async function objectsPullCommand(cliOptions: ObjectsPullCommandOptions = {}): Promise<void> {
  const cwd = process.cwd();

  let sinceDate: string;

  if (cliOptions.since) {
    sinceDate = resolveSinceValue(cliOptions.since, cwd);
  } else {
    const cache = loadObjectsCache(cwd);
    if (!cache?.lastSync) {
      logger.error("No objects cache found. Specify --since for the first pull.");
      logger.error("Examples:");
      logger.error("  btc objects pull --since today");
      logger.error("  btc objects pull --since git");
      logger.error("  btc objects pull --since 2026-01-01");
      logger.error("  btc objects pull --since abc1234   (commit hash)");
      process.exit(1);
    }
    sinceDate = cache.lastSync;
  }

  logger.info(`Pulling objects since ${sinceDate}...`);

  await executePullPipeline(cwd, sinceDate, cliOptions);
}
