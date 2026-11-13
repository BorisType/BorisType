import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const receiptName = /^npm-upload-(intent|result)-([1-9]\d*)$/;

export function uploadReceipt(target, bytes, context, status = "attempted") {
  if (!/^[a-f0-9]{40}$/.test(context.commit) || !Number.isSafeInteger(context.attempt) || context.attempt < 1)
    throw new Error("Invalid publication receipt context");
  return {
    schema: 1,
    name: target.name,
    version: target.version,
    channel: target.channel,
    sha512: createHash("sha512").update(bytes).digest("hex"),
    commit: context.commit,
    attempt: context.attempt,
    status,
  };
}

export function uploadMode(target, bytes, context, receipts) {
  const expected = uploadReceipt(target, bytes, context);
  const attempts = new Map();
  for (const receipt of receipts) {
    if (
      ["schema", "name", "version", "channel", "sha512", "commit"].some((key) => receipt[key] !== expected[key]) ||
      !Number.isSafeInteger(receipt.attempt) ||
      receipt.attempt < 1 ||
      receipt.attempt >= context.attempt ||
      !["attempted", "accepted", "rejected", "unknown"].includes(receipt.status)
    )
      throw new Error("Publication receipt does not match this artifact, commit or attempt");
    const states = attempts.get(receipt.attempt) ?? new Set();
    states.add(receipt.status);
    attempts.set(receipt.attempt, states);
  }
  // A missing result means the runner could have died after npm accepted the upload.
  return [...attempts.values()].some((states) => !states.has("rejected") || states.has("accepted") || states.has("unknown"))
    ? "verify"
    : "upload";
}

export function receiptArtifactIds(artifacts, jobs = [], attempt = 1) {
  const receipts = artifacts.filter((artifact) => receiptName.test(artifact.name));
  for (const job of jobs) {
    if (job.name !== "publish" || job.run_attempt >= attempt) continue;
    const uploaded = job.steps?.some((step) => step.name === "Upload once with npm trusted publishing" && step.conclusion !== "skipped");
    if (uploaded && !receipts.some((artifact) => artifact.name.endsWith(`-${job.run_attempt}`)))
      throw new Error(`Missing publication receipt evidence for upload attempt ${job.run_attempt}; inspect npm before another upload`);
  }
  return receipts.map((artifact) => {
    if (artifact.expired) throw new Error("Publication evidence expired; do not upload again without investigating npm");
    if (!Number.isSafeInteger(artifact.id) || artifact.id < 1) throw new Error("Invalid publication receipt artifact ID");
    return artifact.id;
  });
}

export function assertRestoredReceipts(artifacts, restored) {
  const expected = artifacts.filter((artifact) => receiptName.test(artifact.name)).map((artifact) => artifact.name);
  const actual = restored.map((receipt) => {
    if (!receipt || !Number.isSafeInteger(receipt.attempt) || !["attempted", "accepted", "rejected", "unknown"].includes(receipt.status))
      throw new Error("Invalid restored publication receipt");
    return `npm-upload-${receipt.status === "attempted" ? "intent" : "result"}-${receipt.attempt}`;
  });
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || expected.some((name) => !actual.includes(name)))
    throw new Error("Incomplete publication receipt download; do not infer that an earlier upload was rejected");
}

export function uploadOutcome(error, target) {
  if (!error) return "accepted";
  // This diagnostic belongs to a rejected registry PUT in pinned pnpm 12.16.1.
  // Conflicts and lost/5xx responses can follow an accepted request, so remain uncertain.
  const text = String(error.stderr ?? "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\n\s*│\s*/g, " ");
  const code = /^[ \t]*(?:Error:[ \t]*)?(ERR_PNPM_[A-Z0-9_]+)\b/m.exec(text);
  if (code?.[1] !== "ERR_PNPM_FAILED_TO_PUBLISH") return "unknown";
  // The response body may quote another error. Only the leading diagnostic's first
  // status belongs to this PUT; a nested 403 must never turn a 5xx into a safe retry.
  const diagnostic = /Failed to publish package ([^\s]+) \(status (\d{3})(?: |\))/.exec(text.slice(code.index + code[0].length));
  return diagnostic?.[1] === `${target.name}@${target.version}` && [400, 401, 403, 413, 422].includes(Number(diagnostic[2]))
    ? "rejected"
    : "unknown";
}

export async function readReceipts(directory) {
  const receipts = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) receipts.push(...(await readReceipts(path)));
    else if (entry.isFile() && /^upload-(intent|result)\.json$/.test(entry.name)) receipts.push(JSON.parse(await readFile(path, "utf8")));
    else throw new Error(`Unexpected publication receipt file: ${entry.name}`);
  }
  return receipts;
}

export async function performUpload(target, bytes, context, directory, upload) {
  let failure;
  try {
    await upload();
  } catch (error) {
    failure = error;
  }
  const status = uploadOutcome(failure, target);
  await writeFile(join(directory, "upload-result.json"), JSON.stringify(uploadReceipt(target, bytes, context, status)));
  if (status === "rejected")
    throw new Error(`npm rejected ${target.name}@${target.version}; a manual rerun may retry the rejected upload`, { cause: failure });
  return status;
}
