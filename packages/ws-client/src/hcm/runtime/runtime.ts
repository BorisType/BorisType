import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildScript } from "../load.js";
import type { WshcmEvaluator } from "../types.js";
import { BundleFailure, loadBundle, matchesArtifact } from "./bundle.js";
import {
  compareVersions,
  identity,
  runtimeStatusSchema,
  WshcmRuntimeError,
  type RuntimeStatus,
  type RuntimeBuildIdentity,
} from "./contracts.js";

const bootstrapTemplate = readFileSync(new URL("../../../resources/runtime-bootstrap.bs", import.meta.url), "utf8");
const operationTemplate = readFileSync(new URL("../../../resources/runtime-operation.bs", import.meta.url), "utf8");
const bootstrapResponse = z.strictObject({ schemaVersion: z.literal(1), files: z.record(z.string(), z.string()) });

export interface WshcmRuntimeOptions {
  /** Directory containing manifest.json and bootstrap/component subdirectories. Defaults to packaged artifacts. */
  bundleDirectory?: string;
  /** A directory name under AppDirectoryPath()/dotnetcore/shared; native/runtimes/refs are reserved. */
  installationName?: string;
}

function localFailure(reason: string, expected: RuntimeBuildIdentity | null, error: unknown): WshcmRuntimeError {
  return new WshcmRuntimeError(
    { schemaVersion: 1, status: "blocked", reason, expected, installed: null, loaded: null, changed: false, process: null },
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

function parseCarrier(wire: unknown, maxBytes: number): unknown {
  if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > maxBytes * 6 + 2) throw new Error("Invalid runtime response carrier");
  const text: unknown = JSON.parse(wire);
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("Invalid runtime response size");
  return JSON.parse(text);
}

/** Automatically installs packaged dependencies and reports actual loaded code in the answering process. */
export class WshcmRuntime {
  private pending: Promise<RuntimeStatus> | undefined;
  private verifiedBootstrap: string | undefined;
  private inspectNext = false;
  private readonly directory: string;
  private readonly installationName: string;

  constructor(
    private readonly evaluator: WshcmEvaluator,
    options: WshcmRuntimeOptions = {},
  ) {
    this.directory = options.bundleDirectory ?? fileURLToPath(new URL("../../../resources/dotnet/", import.meta.url));
    this.installationName = options.installationName ?? ".boristype-runtime";
  }

  /** Coalesce concurrent preparations, then recheck the answering process on every later call. */
  ensure(): Promise<RuntimeStatus> {
    if (!this.pending) {
      this.pending = this.prepare().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  /** Publish immutable files and the selection for the next host startup, without loading the component. */
  stageForStartup(): Promise<RuntimeStatus> {
    return this.prepare(true);
  }

  async requireReady(): Promise<RuntimeStatus> {
    const status = await this.ensure();
    if (status.status !== "ready") throw new WshcmRuntimeError(status);
    return status;
  }

  private async prepare(stageOnly = false): Promise<RuntimeStatus> {
    let expected: RuntimeBuildIdentity | null = null;
    try {
      if (
        !/^\.?[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(this.installationName) ||
        ["native", "runtimes", "refs"].includes(this.installationName.toLowerCase())
      )
        throw new BundleFailure(
          "InvalidInstallationName",
          "Expected a non-reserved directory name under AppDirectoryPath()/dotnetcore/shared",
        );
      const { manifest, bootstrapPayload, componentPayload } = await loadBundle(this.directory);
      expected = identity(manifest.component);
      const fingerprint = JSON.stringify(manifest.bootstrap);
      if (this.verifiedBootstrap !== fingerprint) {
        this.inspectNext = false;
        const request = {
          installationName: this.installationName,
          id: manifest.bootstrap.id,
          uploadId: randomUUID(),
          files: manifest.bootstrap.files.map((file) => ({ path: file.path, base64: bootstrapPayload[file.path] })),
        };
        let response;
        try {
          response = bootstrapResponse.parse(
            parseCarrier(await this.evaluator.eval(buildScript(bootstrapTemplate, { request: JSON.stringify(request) })), 12582912),
          );
        } catch (error) {
          throw localFailure("BootstrapTransportError", expected, error);
        }
        if (Object.keys(response.files).length !== manifest.bootstrap.files.length)
          throw localFailure("BootstrapArtifactMismatch", expected, "Unexpected helper files");
        for (const file of manifest.bootstrap.files) {
          const encoded = response.files[file.path];
          if (
            encoded === undefined ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) ||
            !matchesArtifact(Buffer.from(encoded, "base64"), file)
          )
            throw localFailure("BootstrapArtifactMismatch", expected, "Helper readback does not match packaged bytes");
        }
        this.verifiedBootstrap = fingerprint;
      }
      const execute = async (method: "InspectJson" | "EnsureJson" | "StageJson") => {
        const request = {
          installationName: this.installationName,
          bootstrapId: manifest.bootstrap.id,
          method,
          descriptorJson: JSON.stringify(manifest.component),
          ...(method !== "InspectJson" ? { payloadJson: JSON.stringify(componentPayload) } : {}),
        };
        try {
          const result = runtimeStatusSchema.parse(
            parseCarrier(await this.evaluator.eval(buildScript(operationTemplate, { request: JSON.stringify(request) })), 65536),
          );
          if (JSON.stringify(result.expected) !== JSON.stringify(expected)) throw new Error("Runtime expected identity mismatch");
          if (method === "StageJson" && result.status !== "blocked" && result.status !== "installed")
            throw new Error("Staging did not confirm publication");
          const confirmed =
            method === "StageJson" && result.status === "installed" ? "installed" : result.status === "ready" ? "loaded" : null;
          if (confirmed) {
            const actual = result[confirmed];
            if (!actual || actual.id !== expected!.id || actual.apiVersion !== expected!.apiVersion)
              throw new Error("Runtime status lacks compatible " + confirmed + " identity");
            const version = compareVersions(actual.version, expected!.version);
            if (version < 0 || (version === 0 && (actual.buildId !== expected!.buildId || actual.version !== expected!.version)))
              throw new Error("Runtime status contradicts " + confirmed + " build identity");
          }
          return result;
        } catch (error) {
          this.verifiedBootstrap = undefined;
          this.inspectNext = false;
          throw localFailure("RuntimeTransportError", expected, error);
        }
      };
      if (stageOnly) return await execute("StageJson");
      let status = await execute(this.inspectNext ? "InspectJson" : "EnsureJson");
      const inspected = this.inspectNext;
      this.inspectNext = true;
      if (
        inspected &&
        (status.status === "missing" ||
          status.status === "installed" ||
          (status.status === "restart_required" && status.installed === null))
      )
        status = await execute("EnsureJson");
      return status;
    } catch (error) {
      if (error instanceof WshcmRuntimeError) throw error;
      throw localFailure(error instanceof BundleFailure ? error.reason : "RuntimeError", expected, error);
    }
  }
}
