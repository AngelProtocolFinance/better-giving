import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { href } from "react-router";
import * as v from "valibot";
import { client_ip } from "#/.server/auth/rate-limit";
import { to_fn } from "#/.server/donation-recipient";
import { get_npos } from "#/.server/npos";
import { stripe_amounts } from "#/components/donation/common/amounts";
import {
  checkout_session,
  checkout_session_state,
} from "#/routes/api.donation-intents/stripe/checkout-session";
import { npo_descriptor_suffix } from "#/routes/api.donation-intents/stripe/descriptor-suffix";
import { donor_refusal } from "#/routes/api.donation-intents/stripe/donor-refusal";
import { MIN_DONATION_USD } from "@/constants/common";
import type { IDonation, IDonor, IProgram } from "@/donations";
import { to_from } from "@/donations/helpers";
import { app } from "$/env";
import { db } from "$/pg/db";
import {
  agent_donation_expire,
  agent_donation_reserve,
  donation_get,
  donation_update,
} from "$/pg/queries/donation";
import { npo_by_regnum } from "$/pg/queries/npo";
import { npo_program_get } from "$/pg/queries/program";

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 5;
const tip_percent = v.picklist(["none", "10", "15", "20"]);
const to_id = v.union([
  v.pipe(v.number(), v.integer(), v.minValue(1)),
  v.pipe(v.string(), v.uuid()),
]);
const quote_input = v.strictObject({
  recipient_id: to_id,
  amount: v.pipe(
    v.number(),
    v.minValue(MIN_DONATION_USD),
    v.check(
      (amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8,
      "amount must use at most two decimal places"
    )
  ),
  tip_percent: v.optional(tip_percent, "none"),
  cover_processing_fee: v.optional(v.boolean(), false),
  program_id: v.optional(v.pipe(v.string(), v.uuid())),
  currency: v.optional(v.literal("USD"), "USD"),
  frequency: v.optional(v.literal("one-time"), "one-time"),
});
const donor = v.strictObject({
  email: v.pipe(v.string(), v.email(), v.toLowerCase()),
  first_name: v.pipe(v.string(), v.nonEmpty()),
  last_name: v.pipe(v.string(), v.nonEmpty()),
});
const donate_input = v.strictObject({
  quote_token: v.pipe(v.string(), v.nonEmpty()),
  donor,
});
const status_input = v.strictObject({
  donation_id: v.pipe(v.string(), v.uuid()),
});
const find_input = v.pipe(
  v.strictObject({
    query: v.optional(v.string()),
    ein: v.optional(v.string()),
  }),
  v.check((input) => !!input.query || !!input.ein, "query or ein is required")
);
const quote_token = v.strictObject({
  v: v.literal(1),
  id: v.pipe(v.string(), v.uuid()),
  ...quote_input.entries,
});

interface IQuoteToken {
  v: 1;
  id: string;
  recipient_id: number | string;
  amount: number;
  tip_percent: "none" | "10" | "15" | "20";
  cover_processing_fee: boolean;
  program_id?: string;
  currency: "USD";
  frequency: "one-time";
}

export interface IAgentQuote {
  quote_token: string;
  quote_id: string;
  recipient: { id: string; name: string; type: "npo" | "fund" };
  currency: "USD";
  frequency: "one-time";
  amount: IDonation["amount"] & { total: number };
  program?: IProgram;
}

export class AgentDonationError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function parsed<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: TSchema, input: unknown): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (result.issues) {
    throw new AgentDonationError(
      "invalid_input",
      result.issues[0]?.message ?? "Invalid input"
    );
  }
  return result.output;
}

const quote_mac = (body: string) =>
  createHmac("sha256", app.api_encryption_key)
    .update(`agent-quote:${body}`)
    .digest();

function encode_quote(quote: IQuoteToken): string {
  const body = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return `${body}.${quote_mac(body).toString("base64url")}`;
}

function decode_quote(token: string): IQuoteToken {
  const invalid = new AgentDonationError(
    "invalid_quote",
    "The quote token is invalid."
  );
  const [body, mac, ...rest] = token.split(".");
  if (!body || !mac || rest.length) throw invalid;
  const given = Buffer.from(mac, "base64url");
  const expected = quote_mac(body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw invalid;
  }
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return parsed(quote_token, value);
  } catch {
    throw invalid;
  }
}

function quote_amount(
  amount: number,
  tip: IQuoteToken["tip_percent"],
  cover_processing_fee: boolean
) {
  const parts = stripe_amounts({
    amount,
    tip_format: tip,
    tip: "0",
    cover_processing_fee,
    currency: { code: "USD", rate: 1 },
  });
  return { ...parts, total: parts.base + parts.tip + parts.fee_allowance };
}

export async function find_nonprofit(input: unknown) {
  const args = parsed(find_input, input);
  if (args.ein) {
    const item = await npo_by_regnum(args.ein);
    return { items: item ? [item] : [] };
  }
  return get_npos({
    query: args.query,
    page: 1,
    fields: ["name", "registration_number", "hq_country", "tagline", "active"],
  });
}

export async function create_quote(input: unknown): Promise<IAgentQuote> {
  const args = parsed(quote_input, input);
  const recipient = await to_fn(args.recipient_id, { open_at: new Date() });
  if (!recipient) {
    throw new AgentDonationError(
      "recipient_unavailable",
      "This recipient is not accepting donations."
    );
  }
  if (!recipient.to_tip_allowed && args.tip_percent !== "none") {
    throw new AgentDonationError(
      "tip_not_allowed",
      "This recipient does not accept Better Giving tips. Request a quote with tip_percent set to none."
    );
  }
  const program_row =
    args.program_id && typeof args.recipient_id === "number"
      ? await npo_program_get(args.program_id, args.recipient_id)
      : undefined;
  if (args.program_id && !program_row) {
    throw new AgentDonationError(
      "program_not_found",
      "The program does not belong to this nonprofit."
    );
  }
  const program = program_row
    ? { id: program_row.id, name: program_row.title }
    : undefined;
  const id = crypto.randomUUID();
  const token: IQuoteToken = {
    v: 1,
    id,
    recipient_id: args.recipient_id,
    amount: args.amount,
    tip_percent: args.tip_percent,
    cover_processing_fee: args.cover_processing_fee,
    program_id: args.program_id,
    currency: "USD",
    frequency: "one-time",
  };
  return {
    quote_token: encode_quote(token),
    quote_id: id,
    recipient: {
      id: recipient.to_id,
      name: recipient.to_name,
      type: recipient.to_type,
    },
    currency: "USD",
    frequency: "one-time",
    amount: quote_amount(
      args.amount,
      args.tip_percent,
      args.cover_processing_fee
    ),
    program,
  };
}

function caller_id(request: Request): string {
  // same trusted address as the auth limiter: Vercel overwrites a single
  // `x-forwarded-for`, and a chain or `cf-connecting-ip` is caller-supplied.
  // missing and spoofed callers share one bucket instead of a fresh one each.
  const ip = client_ip(request.headers) ?? "unknown";
  return `ip:${createHash("sha256").update(ip).digest("hex")}`;
}

const quote_expired = () =>
  new AgentDonationError(
    "quote_expired",
    "The checkout for this quote expired. Request a new quote."
  );

async function open_checkout(don: IDonation) {
  try {
    const descriptor_suffix = await npo_descriptor_suffix(don);
    const session = await checkout_session({
      ...don.amount,
      order_id: don.id,
      donor_email: don.from_email,
      recipient_name: don.to_name,
      cancel_path:
        don.to_type === "fund"
          ? href("/donate-fund/:fund_id", { fund_id: don.to_id })
          : href("/donate/:id", { id: don.to_id }),
      descriptor_suffix,
    });
    await donation_update(db, don.id, { via_extra: session.id });
    return { donation_id: don.id, checkout_url: session.url };
  } catch (error) {
    const refusal = donor_refusal(error);
    if (!refusal) throw error;
    throw new AgentDonationError(refusal.code, refusal.reason);
  }
}

/** a retried quote resumes the saved row; the token's amounts are never re-read */
async function resume_checkout(don: IDonation | undefined, donor: IDonor) {
  if (don?.source !== "bg-agent") {
    throw new AgentDonationError(
      "invalid_quote",
      "The quote id is unavailable."
    );
  }
  if (don.from_email.toLowerCase() !== donor.email) {
    throw new AgentDonationError(
      "quote_conflict",
      "This quote is already reserved for a different donor. Request a new quote."
    );
  }
  if (don.status === "expired") throw quote_expired();
  if (don.status !== "created") {
    throw new AgentDonationError(
      "quote_used",
      "This quote was already paid. Check donation_status."
    );
  }
  if (!don.via_extra) return open_checkout(don);

  const session = await checkout_session_state(don.via_extra);
  if (session.status === "open") {
    return { donation_id: don.id, checkout_url: session.url };
  }
  if (session.status === "expired") {
    await agent_donation_expire(don.id);
    throw quote_expired();
  }
  throw new AgentDonationError(
    "quote_used",
    "This quote was already paid. Check donation_status."
  );
}

export async function donate(input: unknown, request: Request) {
  const args = parsed(donate_input, input);
  const quote = decode_quote(args.quote_token);
  const prior = await donation_get(quote.id);
  if (prior) return resume_checkout(prior, args.donor);

  const recipient = await to_fn(quote.recipient_id, { open_at: new Date() });
  if (!recipient) {
    throw new AgentDonationError(
      "recipient_unavailable",
      "This recipient is not accepting donations."
    );
  }
  if (!recipient.to_tip_allowed && quote.tip_percent !== "none") {
    throw new AgentDonationError(
      "tip_not_allowed",
      "This recipient does not accept Better Giving tips."
    );
  }
  const program_row =
    quote.program_id && typeof quote.recipient_id === "number"
      ? await npo_program_get(quote.program_id, quote.recipient_id)
      : undefined;
  if (quote.program_id && !program_row) {
    throw new AgentDonationError(
      "program_not_found",
      "The program does not belong to this nonprofit."
    );
  }
  const program = program_row
    ? { id: program_row.id, name: program_row.title }
    : undefined;
  const source_id = caller_id(request);
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const amount = quote_amount(
    quote.amount,
    quote.tip_percent,
    quote.cover_processing_fee
  );
  const { total: _total, ...donation_amount } = amount;
  const now = new Date().toISOString();
  const donor_data: IDonor = args.donor;
  const row: IDonation = {
    id: quote.id,
    status: "created",
    via: "stripe",
    via_extra: undefined,
    source_id,
    upusd: 1,
    created_at: now,
    updated_at: now,
    ...recipient,
    ...to_from(donor_data),
    amount: donation_amount,
    currency: "USD",
    frequency: "one-time",
    source: "bg-agent",
    program,
  };

  const reservation = await agent_donation_reserve(row, since, RATE_LIMIT);
  if (reservation === "limited") {
    throw new AgentDonationError(
      "rate_limited",
      "Donation checkout limit reached. Try again in one hour."
    );
  }
  if (reservation === "existing") {
    return resume_checkout(await donation_get(quote.id), args.donor);
  }
  return open_checkout(row);
}

/** a `created` row whose Checkout lapsed is expired, even if Stripe's expiry event never arrived */
async function current_status(don: IDonation): Promise<IDonation["status"]> {
  if (don.status !== "created" || !don.via_extra) return don.status;
  const session = await checkout_session_state(don.via_extra);
  if (session.status !== "expired") return don.status;
  await agent_donation_expire(don.id);
  return "expired";
}

export async function donation_status(input: unknown) {
  const args = parsed(status_input, input);
  const donation = await donation_get(args.donation_id);
  if (donation?.source !== "bg-agent") {
    throw new AgentDonationError("not_found", "Donation not found.");
  }
  return {
    donation_id: donation.id,
    status: await current_status(donation),
    currency: donation.currency,
    amount: {
      ...donation.amount,
      total:
        donation.amount.base +
        donation.amount.tip +
        donation.amount.fee_allowance,
    },
  };
}
