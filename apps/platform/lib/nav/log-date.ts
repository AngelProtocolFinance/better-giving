// the highest stamp handed out so far, in ms
let last_ms = 0;

/**
 * a strictly increasing stamp for `nav_logs.date`.
 *
 * that column is the table's primary key *and* its ordering — `nav_log_append`
 * reads the head by `order by date desc` to get the prior snapshot the price
 * invariant is checked against. one column doing both jobs means two entries
 * written in the same millisecond don't just order ambiguously, they collide on
 * 23505 and take the enclosing transaction with them.
 *
 * `Date.now()` is millisecond-resolution, so a plain timestamp cannot promise
 * the distinctness both jobs need. two writers can reach it inside one
 * millisecond on paths that are entirely ordinary:
 *
 * - a fund settlement runs `settle_npo` per member inside one transaction, so
 *   two members allocating to lock are stamped back to back
 * - a fund refund loops `load_refund_plan` per distribution, each stamping its
 *   own `now`
 *
 * so real time when it has moved on, and the last stamp plus a millisecond when
 * it hasn't. within one process that is a guarantee. two processes settling
 * concurrently can still land on the same millisecond — that residual needs the
 * surrogate key, which needs a migration on a table `nav_holders` references by
 * date, and it fails loudly rather than silently when it happens.
 */
export function nav_log_date(): string {
  last_ms = Math.max(Date.now(), last_ms + 1);
  return new Date(last_ms).toISOString();
}
