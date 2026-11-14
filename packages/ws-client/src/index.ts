/**
 * WSHCM Client - клиент для работы с WebSoft HCM через SP-XML API
 *
 * @module wshcm
 */

export { WshcmClient } from "./client.js";
export { Evaluator } from "./evaluator.js";
export { WshcmException, UnauthorizedError } from "./exceptions.js";
export { renderRequest, parseResponse } from "./soap-utils.js";
export { WshcmUploader } from "./uploader.js";
export type { WshcmClientOptions } from "./types.js";
export type { WshcmUploaderOptions, UploadProgressCallback } from "./uploader.js";

export { WshcmApi } from "./hcm/api.js";
export { wshcmSchemas } from "./hcm/schemas.js";
export { WshcmObjectError } from "./hcm/object-error.js";
export type { WshcmObjectErrorDetails } from "./hcm/object-error.js";
export type { WshcmEvaluator } from "./hcm/types.js";

export { WshcmRuntime } from "./hcm/runtime/runtime.js";
export type { WshcmRuntimeOptions } from "./hcm/runtime/runtime.js";
export { WshcmRuntimeError } from "./hcm/runtime/contracts.js";
export type { RuntimeStatus, RuntimeBuildIdentity, RuntimeComponentDescriptor } from "./hcm/runtime/contracts.js";
