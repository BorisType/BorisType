import { randomUUID } from "node:crypto";

/** Full object/schema snapshot returned to a client, scoped to one MCP instance. */
export interface ObjectSnapshot {
  id: string;
  formUrl: string;
  xml: string;
  schemaXml: string;
  token: string;
  readAt: number;
}

/** Bounded full-read grants, with local serialization but no external atomic CAS guarantee. */
export class ObjectReadState {
  private readonly snapshots = new Map<string, ObjectSnapshot>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Serialize local object operations so a grant cannot be consumed concurrently. */
  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }

  /** Record only a complete, validated response. A new read invalidates the old token. */
  record(read: Omit<ObjectSnapshot, "token" | "readAt">): string {
    this.prune();
    const snapshot = { ...read, token: randomUUID(), readAt: this.now() };
    this.snapshots.delete(read.id);
    this.snapshots.set(read.id, snapshot);
    while (this.snapshots.size > 32) this.snapshots.delete(this.snapshots.keys().next().value!);
    return snapshot.token;
  }

  /** Require and consume an exact-ID grant, including for a rejected/uncertain replace attempt. */
  consume(id: string, token: string): ObjectSnapshot {
    this.prune();
    const snapshot = this.snapshots.get(id);
    if (!snapshot || snapshot.token !== token) throw new Error("ReadRequired: Read the full object in this MCP instance before replace");
    this.snapshots.delete(id);
    return snapshot;
  }

  private prune(): void {
    for (const [id, snapshot] of this.snapshots) if (this.now() - snapshot.readAt >= 30 * 60 * 1000) this.snapshots.delete(id);
  }
}
