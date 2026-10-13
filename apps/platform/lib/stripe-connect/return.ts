/** how the connect flow reports back to the page it returns to, as query params */
export const CONNECT_RESULT_PARAM = "stripe_connect";
/** present only when the result is `error` */
export const CONNECT_REASON_PARAM = "stripe_connect_reason";

export type TConnectResult = "connected" | "denied" | "error";

export type TConnectErrorReason =
  /** the account is already linked to another nonprofit or application */
  | "already_linked"
  /** the target holds a different account and replacing it wasn't confirmed */
  | "replace_unconfirmed"
  /** the round trip through stripe took longer than the state allows */
  | "expired"
  /** the signed-in user isn't the one who started it, or may no longer act */
  | "forbidden"
  /** stripe refused the code, or the write didn't land */
  | "failed";
