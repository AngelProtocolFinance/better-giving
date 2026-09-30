// thrown once a reversal's outcome notice is queued but dists are still
// unreversed. route.ts maps this to 503 so stripe redelivers; process_refund
// skips the dists already reversed, so each redelivery retries only the rest.
export class ReversalIncompleteError extends Error {
  constructor(donation_id: string, failed: number, total: number) {
    super(`${failed} of ${total} dists failed to reverse: ${donation_id}`);
    this.name = "ReversalIncompleteError";
  }
}
