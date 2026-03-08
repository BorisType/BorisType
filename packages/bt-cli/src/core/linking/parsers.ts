/**
 * Парсеры информации о пакетах для линковки
 *
 * Содержит функции для парсинга PackageInfo из:
 * - DependencyNode (для compiler dependencies / polyfill)
 * - BtConfigLinkingPackage (для пользовательских пакетов)
 *
 * @module linking/parsers
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../logger.js";
import { DependencyNode } from "./dependencies.js";
import { BtConfigLinkingPackage } from "../config.js";
import { PackageInfo, PackageType, LinkingContext, ApiExtEntry } from "./types.js";
import {
  normalizePackageType,
  isExecutablePackageType,
  formatValidPackageTypes,
  copyRecursive,
} from "./utils/index.js";

/**
 * Парсит PackageInfo из DependencyNode (для compiler dependencies)
 *
 * @remarks
 * System пакеты линкуются в зависимости от режима:
 * - component (по умолчанию): копируются в components/<ws:name>, НЕ добавляются в api_ext.xml
 * - standalone: копируются по ws:root, добавляются в api_ext.xml
 */
export function parseCompilerDependencyPackageInfo(
  dep: DependencyNode,
  ctx: LinkingContext,
): PackageInfo | null {
  const packageJson = dep.packageJson as any;
  const packageType = normalizePackageType(packageJson["ws:package"]);
  const wsRoot = packageJson["ws:root"];
  const wsName = packageJson["ws:name"];
  const { systemLinkMode } = ctx;

  if (!packageType) {
    logger.warning(`Package ${packageJson.name} does not have ws:package field, skipping`);
    return null;
  }

  if (packageType === "library") {
    // Library пакеты обрабатываются через node_modules
    return null;
  }

  // ws:name обязательно для всех пакетов кроме library
  if (!wsName || typeof wsName !== "string") {
    logger.error(
      `Package ${packageJson.name}: ws:name field is required for ${packageType} packages`,
    );
    process.exit(1);
  }

  // Для system пакетов определяем targetPath и apiext в зависимости от режима
  let targetPath: string;
  let rootUrl: string;
  let apiext: ApiExtEntry | undefined;

  if (packageType === "system") {
    if (systemLinkMode === "standalone") {
      // Standalone режим: копируем по ws:root, добавляем в api_ext.xml
      // ws:root обязателен для standalone режима
      if (typeof wsRoot !== "string" || wsRoot === "") {
        logger.error(
          `Invalid ws:root field in ${dep.projectPath}/package.json. Required for standalone mode.`,
        );
        process.exit(1);
      }
      targetPath = wsRoot;
      rootUrl = "x-local://" + path.posix.normalize(wsRoot);

      // Формируем apiext
      const wsApiext = packageJson["ws:apiext"];
      if (wsApiext) {
        apiext = {
          name: wsApiext.name,
          libs: wsApiext.libs.map((lib: string) => rootUrl + "/" + path.posix.normalize(lib)),
        };
      } else if (packageJson.main) {
        apiext = {
          name: `module:${wsName}`,
          libs: [rootUrl + "/init.xml"],
        };
      }
    } else {
      // Component режим (по умолчанию): копируем в components/<ws:name>, НЕ добавляем в api_ext.xml
      targetPath = `./components/${wsName}`;
      rootUrl = "x-local://components/" + wsName;
      apiext = undefined; // Компоненты не регистрируются в api_ext.xml
    }
  } else {
    // Для standalone/component пакетов - вычисляем targetPath
    if (packageType === "component") {
      targetPath = `./components/${wsName}`;
    } else if (typeof wsRoot === "string" && wsRoot !== "") {
      targetPath = wsRoot;
    } else {
      // ws:root опционален для standalone, по умолчанию ./wt/<ws:name>
      targetPath = `./wt/${wsName}`;
    }
    rootUrl = "x-local://" + path.posix.normalize(targetPath);

    const wsApiext = packageJson["ws:apiext"];
    if (wsApiext) {
      apiext = {
        name: wsApiext.name,
        libs: wsApiext.libs.map((lib: string) => rootUrl + "/" + path.posix.normalize(lib)),
      };
    } else if (packageJson.main && packageType !== "component") {
      // Компоненты не регистрируются в api_ext.xml
      apiext = {
        name: `module:${wsName}`,
        libs: [rootUrl + "/init.xml"],
      };
    }
  }

  return {
    dependencyNode: dep,
    packageJson,
    packageType,
    wsName,
    projectPath: dep.projectPath,
    sourceDir: path.join(dep.projectPath, "build"),
    targetPath,
    rootUrl,
    apiext,
    needsInitGeneration: false, // System пакеты ничего не генерируют
  };
}

/**
 * Парсит PackageInfo из пользовательской конфигурации
 *
 * @remarks
 * Для не-BT пакетов (без ws:package) выполняет копирование и возвращает null.
 * Для BT пакетов формирует полную информацию включая targetPath и apiext.
 */
export function parseUserPackageInfo(
  projectPath: string,
  packageDirAbsolute: string,
  packageConfig: BtConfigLinkingPackage,
  displayName: string,
): PackageInfo | null {
  // Проверяем существование директории пакета
  if (!fs.existsSync(packageDirAbsolute)) {
    logger.error(`❌ Package directory not found: ${packageDirAbsolute}`);
    process.exit(1);
  }

  // Проверяем наличие package.json и определяем тип пакета
  const packageJsonPath = path.join(packageDirAbsolute, "package.json");
  let packageJson: any = null;
  let packageType: PackageType | null = null;

  if (fs.existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      packageType = normalizePackageType(packageJson["ws:package"]);

      if (packageType === "library") {
        logger.error(
          `❌ Package ${displayName}: libraries (ws:package: "library") cannot be linked directly. They are included via node_modules of executable packages.`,
        );
        process.exit(1);
      } else if (packageJson["ws:package"] && !packageType) {
        logger.error(
          `❌ Package ${displayName}: invalid ws:package type "${packageJson["ws:package"]}". Valid types: ${formatValidPackageTypes()}`,
        );
        process.exit(1);
      }
    } catch (error) {
      logger.error(`❌ Failed to parse package.json in ${packageDirAbsolute}: ${error}`);
      process.exit(1);
    }
  }

  const isBorisTypePackage = packageType && isExecutablePackageType(packageType);

  // Проверяем ws:name для BT пакетов
  let wsName: string | undefined;
  if (isBorisTypePackage) {
    wsName = packageJson["ws:name"];
    if (!wsName || typeof wsName !== "string") {
      logger.error(
        `❌ Package ${displayName}: ws:name field is required for ${packageType} packages`,
      );
      process.exit(1);
    }
  }

  // Определяем source директорию
  let sourceDir: string;
  if (packageConfig.source) {
    sourceDir = path.join(projectPath, packageConfig.source);
  } else if (isBorisTypePackage) {
    sourceDir = path.join(packageDirAbsolute, "build");
  } else {
    logger.error(`❌ Package ${displayName}: 'source' is required for non-BorisType packages`);
    process.exit(1);
  }

  if (!fs.existsSync(sourceDir)) {
    logger.error(`❌ Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  // Определяем target
  let targetPath: string;
  if (packageConfig.target) {
    targetPath = packageConfig.target;
  } else if (isBorisTypePackage && packageJson) {
    if (packageType === "component") {
      if (packageJson["ws:root"]) {
        logger.error(
          `❌ Package ${displayName}: components cannot have 'ws:root' field. They are always placed in ./components/<ws:name>`,
        );
        process.exit(1);
      }
      targetPath = `./components/${wsName}`;
    } else if (packageJson["ws:root"]) {
      targetPath = packageJson["ws:root"];
    } else {
      // ws:root опционален для standalone, по умолчанию ./wt/<ws:name>
      targetPath = `./wt/${wsName}`;
    }
  } else {
    logger.error(`❌ Package ${displayName}: 'target' is required for non-BorisType packages`);
    process.exit(1);
  }

  if (!isBorisTypePackage) {
    // Обычная директория - просто копируем
    const distPath = path.join(projectPath, "dist");
    const fullTargetPath = path.join(distPath, targetPath);
    copyRecursive(sourceDir, fullTargetPath);

    const sourceInfo = packageConfig.source || "";
    logger.success(`✓ Copied ${displayName} (${sourceInfo}) to ${targetPath}`);
    return null;
  }

  const rootUrl = "x-local://" + path.posix.normalize(targetPath);

  // Формируем apiext
  let apiext: ApiExtEntry | undefined;
  const wsApiext = packageJson["ws:apiext"];

  if (wsApiext) {
    apiext = {
      name: wsApiext.name,
      libs: wsApiext.libs.map((lib: string) => rootUrl + "/" + path.posix.normalize(lib)),
    };
  } else if (packageJson.main && packageType !== "component") {
    // Компоненты не регистрируются в api_ext.xml
    apiext = {
      name: `module:${wsName}`,
      libs: [rootUrl + "/init.xml"],
    };
  }

  return {
    packageJson,
    packageType: packageType!,
    wsName: wsName!,
    projectPath: packageDirAbsolute,
    sourceDir,
    targetPath,
    rootUrl,
    apiext,
    needsInitGeneration: !!packageJson.main && !wsApiext,
  };
}
