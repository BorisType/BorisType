import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { readResponse } from "./file-contract.js";

/** Original-text UTF-16 interval, with an exclusive end. */
export interface ReadRange {
  start: number;
  end: number;
}
/** A bounded grant of ranges actually returned by read_file in this server instance. */
export interface ReadSnapshot {
  token: string;
  sha256: string;
  totalLength: number;
  ranges: ReadRange[];
  readAt: number;
}

/** Per-createServer read grants; unrelated to a client's conversation lifecycle. */
export class ReadState {
  private readonly snapshots = new Map<string, ReadSnapshot>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Serialize reads and mutations so concurrent requests cannot consume one grant twice. */
  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }

  /** Record the returned interval, merging only the same URL and original byte version. */
  record(path: string, read: z.infer<typeof readResponse>, previousToken?: string): string {
    const now = this.now();
    this.prune(now);
    const previous = this.snapshots.get(path);
    const same =
      previous !== undefined &&
      previousToken === previous.token &&
      previous.sha256 === read.sha256 &&
      previous.totalLength === read.totalLength;
    const sorted = [...(same ? previous.ranges : []), { start: read.startOffset, end: read.endOffset }].sort((a, b) => a.start - b.start);
    const ranges: ReadRange[] = [];
    for (const range of sorted) {
      const last = ranges.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else ranges.push({ ...range });
    }
    if (ranges.length > 256) throw new Error("ReadLimit: Read a wider contiguous range; at most 256 intervals are retained per file");
    const snapshot = { token: randomUUID(), sha256: read.sha256, totalLength: read.totalLength, ranges, readAt: now };
    this.snapshots.delete(path);
    this.snapshots.set(path, snapshot);
    while (this.snapshots.size > 128) this.snapshots.delete(this.snapshots.keys().next().value!);
    return snapshot.token;
  }

  /** Require a live grant for this exact URL, optionally checking a hash or full coverage. */
  require(path: string, token: string, expectedSha256?: string, full = false): ReadSnapshot {
    this.prune(this.now());
    const snapshot = this.snapshots.get(path);
    if (!snapshot || snapshot.token !== token)
      throw new Error("ReadRequired: Read this file in this MCP instance before editing; the token is missing, expired or invalidated");
    if (expectedSha256 !== undefined && expectedSha256.toLowerCase() !== snapshot.sha256)
      throw new Error("Conflict: expectedSha256 does not match the read token");
    if (full && !(snapshot.ranges.length === 1 && snapshot.ranges[0]!.start === 0 && snapshot.ranges[0]!.end === snapshot.totalLength))
      throw new Error("ReadRequired: Read the entire file before overwriting it");
    return snapshot;
  }

  /** Drop a URL grant after a mutation attempt, including an uncertain transport outcome. */
  invalidate(path: string): void {
    this.snapshots.delete(path);
  }

  private prune(now: number): void {
    for (const [path, snapshot] of this.snapshots) if (now - snapshot.readAt >= 30 * 60 * 1000) this.snapshots.delete(path);
  }
}
