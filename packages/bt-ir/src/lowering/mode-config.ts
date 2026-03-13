/**
 * Mode Configuration — typed flags replacing scattered `ctx.mode` checks
 *
 * Each flag controls a specific transpilation behavior, allowing fine-grained
 * configuration instead of broad `mode === "bare"` / `mode === "module"` checks.
 *
 * Three presets correspond to the three CompileMode values:
 * - BARE_CONFIG → all flags false (minimal transpilation)
 * - SCRIPT_CONFIG → platform wrapping enabled, no module features
 * - MODULE_CONFIG → full features including exports and ref format
 *
 * @module lowering/mode-config
 */

import type { CompileMode } from "./visitor.ts";

// ============================================================================
// Interface
// ============================================================================

/**
 * Typed configuration derived from CompileMode.
 *
 * Replaces scattered `ctx.mode === "bare"` / `ctx.mode === "module"` checks
 * with self-documenting boolean flags.
 */
export interface ModeConfig {
  /** Wrap property read/write with bt.getProperty / bt.setProperty */
  wrapPropertyAccess: boolean;
  /** Wrap function calls with bt.callFunction, new with bt.createInstance */
  wrapCallExpression: boolean;
  /** Lower logical operators (&&, ||) and ?? via bt.isTrue */
  useBtIsTrue: boolean;
  /** Use __env/__this/__args function signature, captured variables, closures */
  useEnvDescPattern: boolean;
  /** Dispatch Array/String/Number methods through polyfills */
  usePolyfills: boolean;
  /** Function descriptors use ref/lib format (module) vs callable (script) */
  useRefFormat: boolean;
  /** Module export/import mechanism (__module.exports, __init wrapper) */
  moduleExports: boolean;
}

// ============================================================================
// Presets
// ============================================================================

/** Bare mode: minimal transpilation, nearly 1:1 JS output */
const BARE_CONFIG: ModeConfig = {
  wrapPropertyAccess: false,
  wrapCallExpression: false,
  useBtIsTrue: false,
  useEnvDescPattern: false,
  usePolyfills: false,
  useRefFormat: false,
  moduleExports: false,
};

/** Script mode: full platform wrapping, no module features */
const SCRIPT_CONFIG: ModeConfig = {
  wrapPropertyAccess: true,
  wrapCallExpression: true,
  useBtIsTrue: true,
  useEnvDescPattern: true,
  usePolyfills: true,
  useRefFormat: false,
  moduleExports: false,
};

/** Module mode: full platform wrapping + module exports + ref format */
const MODULE_CONFIG: ModeConfig = {
  wrapPropertyAccess: true,
  wrapCallExpression: true,
  useBtIsTrue: true,
  useEnvDescPattern: true,
  usePolyfills: true,
  useRefFormat: true,
  moduleExports: true,
};

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a ModeConfig from a CompileMode string.
 *
 * @param mode - The compile mode
 * @returns Frozen ModeConfig preset for the given mode
 */
export function createModeConfig(mode: CompileMode): Readonly<ModeConfig> {
  switch (mode) {
    case "bare":
      return BARE_CONFIG;
    case "script":
      return SCRIPT_CONFIG;
    case "module":
      return MODULE_CONFIG;
  }
}
