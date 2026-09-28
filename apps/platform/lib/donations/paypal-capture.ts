/**
 * the part of an Orders v2 capture response that decides its outcome.
 * structural so the browser and the server read it without the sdk.
 */
export interface IPaypalCaptured {
  purchase_units?: { payments?: { captures?: { status?: string }[] } }[];
}

/**
 * - `taken`: COMPLETED, or PENDING — money paypal holds for review.
 *   settlement is the webhook's either way.
 * - `declined`: DECLINED / FAILED — a declined instrument is the donor's to retry.
 * - `unknown`: a missing or unrecognised status — the money may still move.
 */
export type TCaptureOutcome = "taken" | "declined" | "unknown";

export const paypal_capture_outcome = (
  res: IPaypalCaptured
): { outcome: TCaptureOutcome; status: string | undefined } => {
  const status = res.purchase_units?.[0]?.payments?.captures?.[0]?.status;
  if (status === "COMPLETED" || status === "PENDING")
    return { outcome: "taken", status };
  if (status === "DECLINED" || status === "FAILED")
    return { outcome: "declined", status };
  return { outcome: "unknown", status };
};
