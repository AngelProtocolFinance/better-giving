/**
 * one re-attempt after a short pause.
 *
 * the payment sdks are fetched from third-party origins over the donor's own
 * network, and every one of these paths currently gives up on the first
 * failure — the method is withdrawn for the whole mount and the donor is told
 * to pick another one. a single dropped request is the most common cause by a
 * wide margin, so it's worth asking twice before taking the option away.
 *
 * only one extra attempt: the fallback copy has to appear promptly, and a
 * blocked origin (adblock, csp, a firewalled region) fails identically however
 * many times it's asked.
 */
export const retry_once = async <T>(
  fn: () => Promise<T>,
  delay_ms = 300
): Promise<T> => {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, delay_ms));
    return fn();
  }
};
