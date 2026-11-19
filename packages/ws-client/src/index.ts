/**
 * WSHCM Client - клиент для работы с WebSoft HCM через SP-XML API
 *
 * @module wshcm
 */

export { WshcmClient } from "./client.js";
export { Evaluator, type EvaluatorInitializeOptions } from "./evaluator.js";
export { executeXQuery } from "./xquery.js";
export type { XQueryOptions, XQueryResult } from "./xquery.js";
export { WshcmException, UnauthorizedError, WshcmRequestError, WshcmSoapFault, WshcmDispatchError } from "./exceptions.js";
export { renderRequest, parseResponse } from "./soap-utils.js";
export { WshcmUploader } from "./uploader.js";
export type { WshcmClientOptions, WshcmRequestOptions, WshcmValue } from "./types.js";
export type { WshcmUploaderOptions, UploadProgressCallback } from "./uploader.js";

export { WshcmApi } from "./hcm/api.js";
export type { SystemInfoResult, SystemInfoSummary } from "./hcm/system-info.js";
export { WshcmExecutionError } from "./hcm/execute.js";
export type { ExecutionResult, ExecutionErrorDetails } from "./hcm/execute.js";
export { wshcmSchemas } from "./hcm/schemas.js";
export { WshcmObjectError } from "./hcm/object-error.js";
export type { WshcmObjectErrorDetails } from "./hcm/object-error.js";
export type { WshcmEvaluator } from "./hcm/types.js";

export { WshcmRuntime } from "./hcm/runtime/runtime.js";
export type { WshcmRuntimeOptions } from "./hcm/runtime/runtime.js";
export { WshcmRuntimeError } from "./hcm/runtime/contracts.js";
export type { RuntimeStatus, RuntimeBuildIdentity, RuntimeComponentDescriptor } from "./hcm/runtime/contracts.js";

export { WshcmPackages } from "./hcm/packages/service.js";
export { WshcmPackageError } from "./hcm/packages/contracts.js";
export * from "./hcm/packages/schemas.js";
export type * from "./hcm/packages/contracts.js";
export type { PackageArtifact } from "./hcm/packages/artifacts.js";
export type * from "./hcm/packages/service.js";
