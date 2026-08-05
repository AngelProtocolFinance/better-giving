import { match_funnel } from "../.server/pg/queries/match";

/**
 * print the employer-matching funnel for an environment.
 *
 * `bun jobs/match-funnel.ts [since]`, where `since` is any timestamp postgres
 * parses — omit it for all time. reads whichever database the loaded env points
 * at, so name the env file when running it against anything but dev.
 *
 * read-only. this exists so the launch can be watched from day one without an
 * admin surface to build first; when one lands, it reads the same query.
 */
const since = process.argv[2];
const f = await match_funnel(since);

// each rate is against the stage that could have produced it, not against the
// top — a pack that never went out cannot be blamed for a missing claim
const pct = (n: number, of: number) =>
  of === 0 ? "  — " : `${((n / of) * 100).toFixed(1)}%`;

console.info(`\nmatch funnel${since ? ` since ${since}` : ""}`);
// settled plus both refunded statuses — money that landed, whether or not it
// later went back. counting only settled would drop a refund out of this
// denominator and out of every stage's numerator at once, which reads as though
// the donation never happened. see IMatchFunnel.donations.
console.info(`  donations paid      ${f.donations}`);
console.info(
  `  with employer       ${f.with_employer}  ${pct(f.with_employer, f.donations)} of donations`
);
console.info(
  `  pack sent           ${f.pack_sent}  ${pct(f.pack_sent, f.with_employer)} of employers given`
);
console.info(
  `  chased              ${f.chased}  ${pct(f.chased, f.pack_sent)} of packs went unanswered 3d`
);
console.info(
  `  filed               ${f.submitted}  ${pct(f.submitted, f.pack_sent)} of packs`
);
// the terminal stage, and the only one an employer confirmed — against filings,
// not against packs: an employer can only pay a claim that was actually filed
console.info(
  `  matched             ${f.matched}  ${pct(f.matched, f.submitted)} of filings paid\n`
);
// not a stage — every one of these is already counted in the send stages above,
// because the stamp is burnt before the mail leaves. read it as how much of what
// reads as sent never reached anyone. chases are in the denominator: a refused
// chase is one of the two kinds this counts, so leaving it out would inflate the
// rate.
console.info(
  `  ↳ send failed       ${f.send_failed}  ${pct(f.send_failed, f.pack_sent + f.chased)} of mails above never left`
);
// not a stage either — the money went back, but every stage the event reached
// before it did still counts above. no rate: the funnel exposes no event count
// to divide by, and using a stage would be wrong rather than rough.
console.info(
  `  ↳ voided            ${f.voided}  of the above were later refunded\n`
);

process.exit(0);
