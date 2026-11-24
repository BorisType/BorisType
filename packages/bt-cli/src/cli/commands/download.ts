import { WshcmClient, WshcmDownloader } from "@boristype/ws-client";
import { resolvePushConnectionOptions } from "../../core/pushing/config";
import type { PushCommandOptions } from "../../core/pushing/types";

export async function downloadCommand(
  path: string,
  destination: string,
  options: PushCommandOptions & { chunkSize?: number },
): Promise<void> {
  const { https, host, port, username, password } = resolvePushConnectionOptions(process.cwd(), options);
  const client = new WshcmClient({ overHttps: https, host, port, username, password });
  const evaluator = client.createEvaluator();
  const downloader = new WshcmDownloader({ evaluator, path, destination, chunkSize: options.chunkSize });
  await client.initialize();
  try {
    await evaluator.initialize();
    console.log(JSON.stringify(await downloader.download()));
  } finally {
    if (!(await evaluator.close())) console.error("Temporary evaluator cleanup unconfirmed");
  }
}
