/**
 * Reinit модулей на WSHCM сервере
 *
 * Собирает init-скрипты из dist и выполняет их через evaluator.
 *
 * @module core/pushing/reinit
 */

import { Evaluator } from "@boristype/ws-client";
import { logger } from "../logger";
import { collectComponentInitScripts, collectStandaloneInitScripts } from "./init-scripts";
import type { InitScript } from "./types";

/** The native object loader must finish before any application init can observe its objects. */
export async function reinitModules(evaluator: Evaluator, distPath: string): Promise<void> {
  logger.info("🔄 Collecting init scripts...");
  const standaloneScripts = collectStandaloneInitScripts(distPath);
  const startup = standaloneScripts.find((script) => script.startupObjects);
  const initScripts: InitScript[] = [
    ...collectComponentInitScripts(distPath).filter((script) => script.name !== "bt-runtime"),
    ...standaloneScripts.filter((script) => !script.startupObjects),
  ];

  try {
    if (startup) {
      logger.info("Applying startup objects...");
      const result = await evaluator.eval(
        "var outcome = 'ok'; try {\n" +
          startup.code +
          "\n} catch (err) { outcome = 'error: ' + StrLeftCharRange(String(err), 4000); } return outcome;",
      );
      if (result !== "ok") throw new Error(typeof result === "string" ? result : "Invalid startup response");
    }
    if (initScripts.length) await evaluator.evalCode("bt.init_require();\nreturn;");
  } catch (error) {
    // A network error after dispatch must not trigger DeploySession's full upload + reinit retry.
    if (startup)
      throw new Error("Reinit failed after dispatching startup objects. Check the stand before retrying: " + (error as Error).message, {
        cause: error,
      });
    throw error;
  }
  if (!initScripts.length) {
    if (!startup) logger.info("ℹ️ No init scripts found");
    return;
  }

  // Вывод найденных скриптов
  logger.info(`📜 Found ${initScripts.length} init script(s):`);
  for (const script of initScripts) {
    logger.info(`\n${"─".repeat(60)}`);
    logger.info(`📦 [${script.type}] ${script.name}`);
    logger.info(`${"─".repeat(60)}`);
    console.log(script.code);
  }
  logger.info(`\n${"─".repeat(60)}`);

  // Выполнение init скриптов
  for (const script of initScripts) {
    logger.info(`⚙️ Executing init for [${script.type}] ${script.name}...`);
    try {
      await evaluator.evalCode(script.code + "\nreturn;");
      logger.info(`✅ Successfully executed init for ${script.name}`);
    } catch (error) {
      logger.error(`❌ Error executing init for ${script.name}: ${(error as Error).message}`);
    }
  }
}
