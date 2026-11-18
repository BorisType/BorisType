import { WshcmClient, WshcmRequestError, type Evaluator, type WshcmEvaluator } from "@boristype/ws-client";
import { HcmConnectionError, type ConnectionTarget } from "./connection-error.js";
import { defaultConnectionTimeoutMs, toWshcmClientOptions, type McpServerOptions } from "./types.js";

/** Own one session's evaluator. Only explicitly requested evaluations prepare HCM. */
export class ConnectionManager implements WshcmEvaluator {
  private readonly client: WshcmClient;
  private readonly backend: Evaluator;
  private readonly target: ConnectionTarget;
  private readonly request;
  private authenticated = false;
  private setupAttempted = false;
  private pending?: Promise<void>;
  private closing?: Promise<void>;

  constructor(options: McpServerOptions) {
    this.client = new WshcmClient(toWshcmClientOptions(options));
    this.backend = this.client.createEvaluator();
    this.request = { timeoutMs: options.connectionTimeoutMs ?? defaultConnectionTimeoutMs };
    this.target = { host: options.host, port: options.port, https: options.https };
  }

  private checkOpen() {
    if (this.closing) throw new HcmConnectionError(this.target, undefined, false, true);
  }

  private async prepare() {
    if (!this.authenticated) {
      await this.client.initialize(this.request);
      this.authenticated = true;
    }
    this.checkOpen();
    if (!this.setupAttempted) {
      this.setupAttempted = true;
      await this.backend.initialize(this.request);
    }
    this.checkOpen();
    if (!(await this.backend.probe(this.request))) throw new Error("Unexpected evaluator probe result");
  }

  async eval(code: string): Promise<unknown> {
    this.checkOpen();
    this.pending ??= this.prepare()
      .catch((cause) => {
        this.authenticated = false;
        if (cause instanceof HcmConnectionError) throw cause;
        throw new HcmConnectionError(this.target, cause, false);
      })
      .finally(() => {
        this.pending = undefined;
      });
    await this.pending;
    this.checkOpen();
    try {
      return await this.backend.eval(code);
    } catch (cause) {
      if (!(cause instanceof WshcmRequestError)) throw cause;
      this.authenticated = false;
      throw new HcmConnectionError(this.target, cause, true);
    }
  }

  close(): Promise<void> {
    this.closing ??= Promise.resolve().then(async () => {
      await this.pending?.catch(() => undefined);
      if (this.setupAttempted && !(await this.backend.close(this.request))) {
        throw new Error("Temporary WSHCM evaluator cleanup was not confirmed");
      }
    });
    return this.closing;
  }
}
