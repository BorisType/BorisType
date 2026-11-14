/** Structured native/local diagnostics preserve the known mutation outcome and identity. */
export interface WshcmObjectErrorDetails {
  ok?: false;
  id?: string;
  phase: "input" | "transport" | "read" | "validate" | "load" | "bind" | "save" | "readback";
  writeStatus: "not_attempted" | "unknown" | "saved";
  error: { code: string; message: string };
}

export class WshcmObjectError extends Error {
  constructor(public readonly details: WshcmObjectErrorDetails) {
    super(`${details.error.code}: ${details.error.message}`);
    this.name = "WshcmObjectError";
  }
}
