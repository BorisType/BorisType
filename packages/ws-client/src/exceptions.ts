/** Base class retained for existing SDK callers. */
export class WshcmException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class WshcmSoapFault extends WshcmException {}

export class WshcmRequestError extends WshcmException {
  constructor(
    readonly kind: "authentication" | "http" | "network" | "timeout",
    message: string,
    readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class UnauthorizedError extends WshcmRequestError {
  constructor(message = "Unauthorized", statusCode?: number) {
    super("authentication", message, statusCode);
  }
}

/** Whether the evaluator handed this particular caller's code to its transport. */
export class WshcmDispatchError extends WshcmException {
  constructor(
    message: string,
    readonly dispatched: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
