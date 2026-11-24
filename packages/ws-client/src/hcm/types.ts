/** An initialized evaluator owned and closed by the caller. */
export interface WshcmEvaluator {
  /** Present for evaluators backed by a temporary server module. */
  readonly moduleUrl?: string;
  eval(code: string): Promise<unknown>;
}
