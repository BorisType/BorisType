/**
 * Analyzer module - анализ исходного кода
 *
 * @module analyzer
 */

export {
  analyzeScopes,
  printScopeTree,
  getEnvDepth,
  type Scope,
  type VariableInfo,
  type ScopeAnalysisResult,
} from "./scope-analyzer.ts";
