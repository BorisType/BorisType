/** An initialized evaluator owned and closed by the caller. */
export interface WshcmEvaluator {
  eval(code: string): Promise<unknown>;
}
