/** per-kind qstash delivery config; omitted fields take the queue default */
export interface IDelivery {
  /** delivery attempts after a failure. 0 — the default — is at-most-once */
  retries?: number;
  /** seconds to hold the msg before its first delivery attempt */
  delay_s?: number;
}

export interface IMsg extends IDelivery {
  id: string;
  payload: unknown;
  dedupe: string;
}
