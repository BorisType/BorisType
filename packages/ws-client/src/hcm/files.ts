import { readFileSync } from "node:fs";
import { z } from "zod";
import { callManagedFile } from "./managed-files.js";
import { deleteResponse, editResponse, listResponse, readResponse, writeResponse } from "./file-contract.js";
import { searchResponse } from "./search-contract.js";
import { ReadState } from "./read-state.js";
import { buildScript } from "./load.js";
import { wshcmSchemas } from "./schemas.js";
import type { WshcmEvaluator } from "./types.js";

type Input<K extends keyof typeof wshcmSchemas.files> = z.input<(typeof wshcmSchemas.files)[K]>;
const searchTemplate = readFileSync(new URL("../../resources/search-files.bs", import.meta.url), "utf8");
const mkdirResponse = z.strictObject({ apiVersion: z.literal(2), created: z.boolean() });
const moveResponse = z.strictObject({ apiVersion: z.literal(2), moved: z.literal(true) });
const infoResponse = z
  .strictObject({
    apiVersion: z.literal(2),
    name: z.string(),
    isDirectory: z.boolean(),
    sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    modifiedUtc: z.iso.datetime(),
  })
  .refine((data) => data.isDirectory === (data.sizeBytes === undefined));

/** Physical server files with bounded UTF-8 transport and per-instance read grants. */
export class WshcmFiles {
  private readonly reads = new ReadState();
  constructor(private readonly evaluator: WshcmEvaluator) {}

  async read(input: Input<"read">) {
    const { path, startLine, endLine, readToken } = wshcmSchemas.files.read.parse(input);
    return this.reads.run(async () => {
      if (readToken !== undefined) this.reads.require(path, readToken);
      const data = await callManagedFile(this.evaluator, "ReadJson", path, { startLine, endLine }, readResponse);
      return { ...data, readToken: this.reads.record(path, data, readToken) };
    });
  }

  async write(input: Input<"write">) {
    const { path, content, mode, readToken } = wshcmSchemas.files.write.parse(input);
    return this.reads.run(async () => {
      const snapshot = mode === "overwrite" ? this.reads.require(path, readToken!, undefined, true) : undefined;
      try {
        return await callManagedFile(this.evaluator, "WriteJson", path, { content, mode, expectedSha256: snapshot?.sha256 }, writeResponse);
      } finally {
        this.reads.invalidate(path);
      }
    });
  }

  async edit(input: Input<"edit">) {
    const { path, readToken, edits, dryRun, expectedSha256 } = wshcmSchemas.files.edit.parse(input);
    return this.reads.run(async () => {
      const snapshot = this.reads.require(path, readToken, expectedSha256);
      try {
        return await callManagedFile(
          this.evaluator,
          "EditJson",
          path,
          { edits, dryRun, expectedSha256: snapshot.sha256, allowedRanges: snapshot.ranges },
          editResponse,
        );
      } finally {
        if (!dryRun) this.reads.invalidate(path);
      }
    });
  }

  async list(input: Input<"list">) {
    const { path } = wshcmSchemas.files.list.parse(input);
    return callManagedFile(this.evaluator, "ListJson", path, {}, listResponse);
  }

  async delete(input: Input<"delete">) {
    const { path } = wshcmSchemas.files.delete.parse(input);
    return this.reads.run(async () => {
      try {
        return await callManagedFile(this.evaluator, "DeleteJson", path, {}, deleteResponse);
      } finally {
        this.reads.invalidate(path);
      }
    });
  }

  async mkdir(input: Input<"mkdir">) {
    const { path } = wshcmSchemas.files.mkdir.parse(input);
    return this.reads.run(() => callManagedFile(this.evaluator, "CreateDirectoryJson", path, {}, mkdirResponse));
  }

  async move(input: Input<"move">) {
    const { source, destination } = wshcmSchemas.files.move.parse(input);
    return this.reads.run(async () => {
      try {
        return await callManagedFile(this.evaluator, "MoveJson", source, { destination }, moveResponse);
      } finally {
        this.reads.invalidate(source);
        this.reads.invalidate(destination);
      }
    });
  }

  async info(input: Input<"info">) {
    const { path } = wshcmSchemas.files.info.parse(input);
    return callManagedFile(this.evaluator, "InfoJson", path, {}, infoResponse);
  }

  async search(input: Input<"search">) {
    const { path, ...request } = wshcmSchemas.files.search.parse(input);
    const wire = await this.evaluator.eval(buildScript(searchTemplate, { path, request: JSON.stringify(request) }));
    if (typeof wire !== "string") throw new Error("Expected JSON string carrier from WSHCM search");
    const json: unknown = JSON.parse(wire);
    if (typeof json !== "string") throw new Error("Expected a string DLL response inside the search carrier");
    const result = searchResponse.parse(JSON.parse(json));
    if (Buffer.byteLength(JSON.stringify({ root: path, ...result }), "utf8") > 262144) {
      // Account for the URL envelope in the final UTF-8 output budget.
      const matches: typeof result.matches = [];
      let bytes = Buffer.byteLength(JSON.stringify({ root: path, ...result, matches, limitReason: "output" }), "utf8");
      for (const match of result.matches) {
        const size = Buffer.byteLength(JSON.stringify(match), "utf8") + (matches.length ? 1 : 0);
        if (bytes + size > 262144) break;
        matches.push(match);
        bytes += size;
      }
      return { root: path, ...result, matches, limitReason: "output" as const };
    }
    return { root: path, ...result };
  }
}
