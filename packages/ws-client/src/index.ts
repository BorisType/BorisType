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
