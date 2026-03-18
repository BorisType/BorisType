/**
 * Сравнение текущего build с эталонным build_old.
 *
 * Сравнивает .js файлы в tests/build/ с tests/build_old/.
 * Выводит: идентичные, отличающиеся, отсутствующие в каждой стороне.
 * Для отличающихся — показывает построчный diff.
 *
 * Использование:
 *   node tests/diff-builds.js           # полный отчёт
 *   node tests/diff-builds.js --quiet   # только summary + diff
 *   node tests/diff-builds.js --diff    # показать diff для отличающихся файлов
 *
 * @module tests/diff-builds
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const BUILD_DIR = path.join(__dirname, "build");
const BUILD_OLD_DIR = path.join(__dirname, "build_old");

/** Собирает все .js файлы рекурсивно (относительные пути) */
function collectJsFiles(dir, base = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full, base));
    } else if (entry.name.endsWith(".js")) {
      results.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }
  return results;
}

/** SHA-256 хеш файла */
function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Простой построчный diff */
function lineDiff(contentA, contentB, labelA = "build_old", labelB = "build") {
  const linesA = contentA.split("\n");
  const linesB = contentB.split("\n");
  const output = [];
  const maxLines = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < maxLines; i++) {
    const a = linesA[i];
    const b = linesB[i];
    if (a === b) continue;
    if (a !== undefined && b !== undefined) {
      output.push(`  L${i + 1}:`);
      output.push(`    - ${labelA}: ${a}`);
      output.push(`    + ${labelB}: ${b}`);
    } else if (a !== undefined) {
      output.push(`  L${i + 1}:`);
      output.push(`    - ${labelA}: ${a}`);
    } else {
      output.push(`  L${i + 1}:`);
      output.push(`    + ${labelB}: ${b}`);
    }
  }
  return output.join("\n");
}

// --- Main ---

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const showDiff = args.includes("--diff");

const buildFiles = new Set(collectJsFiles(BUILD_DIR));
const oldFiles = new Set(collectJsFiles(BUILD_OLD_DIR));

const allFiles = new Set([...buildFiles, ...oldFiles]);

const identical = [];
const different = [];
const onlyInBuild = [];
const onlyInOld = [];

for (const file of [...allFiles].sort()) {
  const inBuild = buildFiles.has(file);
  const inOld = oldFiles.has(file);

  if (inBuild && inOld) {
    const hashBuild = fileHash(path.join(BUILD_DIR, file));
    const hashOld = fileHash(path.join(BUILD_OLD_DIR, file));
    if (hashBuild === hashOld) {
      identical.push(file);
    } else {
      different.push(file);
    }
  } else if (inBuild && !inOld) {
    onlyInBuild.push(file);
  } else {
    onlyInOld.push(file);
  }
}

// --- Output ---

const total = allFiles.size;
const identicalCount = identical.length;
const differentCount = different.length;

console.log("=== Build Diff Report ===\n");
console.log(`  Total files:       ${total}`);
console.log(`  Identical:         ${identicalCount}`);
console.log(`  Different:         ${differentCount}`);
console.log(`  Only in build/:    ${onlyInBuild.length}`);
console.log(`  Only in build_old/: ${onlyInOld.length}`);
console.log();

if (differentCount === 0 && onlyInBuild.length === 0 && onlyInOld.length === 0) {
  console.log("✓ All files match.\n");
  process.exit(0);
}

if (different.length > 0) {
  console.log("--- Different files ---");
  for (const file of different) {
    console.log(`  ≠ ${file}`);
  }
  console.log();
}

if (onlyInBuild.length > 0) {
  console.log("--- Only in build/ (new) ---");
  for (const file of onlyInBuild) {
    console.log(`  + ${file}`);
  }
  console.log();
}

if (onlyInOld.length > 0) {
  console.log("--- Only in build_old/ (removed) ---");
  for (const file of onlyInOld) {
    console.log(`  - ${file}`);
  }
  console.log();
}

if (showDiff && different.length > 0) {
  console.log("=== Diffs ===\n");
  for (const file of different) {
    const contentOld = fs.readFileSync(path.join(BUILD_OLD_DIR, file), "utf-8");
    const contentBuild = fs.readFileSync(path.join(BUILD_DIR, file), "utf-8");
    const diff = lineDiff(contentOld, contentBuild);
    if (diff) {
      console.log(`--- ${file} ---`);
      console.log(diff);
      console.log();
    }
  }
}

if (differentCount > 0 || onlyInOld.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
