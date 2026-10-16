import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as v from "valibot";
import { to_fn } from "#/.server/donation-recipient";
import { get_npos } from "#/.server/npos";
import { stripe_amounts } from "#/components/donation/common/amounts";
import {
  checkout_session,
  checkout_session_url,
} from "#/routes/api.donation-intents/stripe/checkout-session";
import { npo_descriptor_suffix } from "#/routes/api.donation-intents/stripe/descriptor-suffix";
import { donor_refusal } from "#/routes/api.donation-intents/stripe/donor-refusal";
import { MIN_DONATION_USD } from "@/constants/common";
import type { IDonation, IDonor, IProgram } from "@/donations";
import { to_from } from "@/donations/helpers";
import { db } from "$/pg/db";
import {
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

function encode_quote(quote: IQuoteToken): string {
  return Buffer.from(JSON.stringify(quote)).toString("base64url");
}

function decode_quote(token: string): IQuoteToken {
  try {
    const value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    return parsed(quote_token, value);
  } catch (error) {
    if (error instanceof AgentDonationError) throw error;
    throw new AgentDonationError(
      "invalid_quote",
      "The quote token is invalid."
    );
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
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ip = request.headers.get("cf-connecting-ip") || forwarded || "unknown";
  return `ip:${createHash("sha256").update(ip).digest("hex")}`;
}

async function existing_checkout(donation_id: string) {
  const existing = await donation_get(donation_id);
  if (!existing) return undefined;
  if (existing.source !== "bg-agent") {
    throw new AgentDonationError(
      "invalid_quote",
      "The quote id is unavailable."
    );
  }
  const session_id = existing.via_extra;
  if (!session_id) return { donation: existing };
  return {
    donation: existing,
    checkout_url: await checkout_session_url(session_id),
  };
}

export async function donate(input: unknown, request: Request) {
  const args = parsed(donate_input, input);
  const quote = decode_quote(args.quote_token);
  const prior = await existing_checkout(quote.id);
  if (prior?.checkout_url) {
    return { donation_id: quote.id, checkout_url: prior.checkout_url };
  }

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

  if (!prior) {
    const reservation = await agent_donation_reserve(row, since, RATE_LIMIT);
    if (reservation === "limited") {
      throw new AgentDonationError(
        "rate_limited",
        "Donation checkout limit reached. Try again in one hour."
      );
    }
    if (reservation === "existing") {
      const raced = await existing_checkout(quote.id);
      if (!raced) {
        throw new AgentDonationError(
          "invalid_quote",
          "The quote id is unavailable."
        );
      }
      if (raced.checkout_url) {
        return { donation_id: quote.id, checkout_url: raced.checkout_url };
      }
    }
  }

  try {
    const descriptor_suffix = await npo_descriptor_suffix(recipient);
    const session = await checkout_session({
      ...donation_amount,
      order_id: quote.id,
      donor_email: args.donor.email,
      recipient_name: recipient.to_name,
      descriptor_suffix,
    });
    await donation_update(db, quote.id, { via_extra: session.id });
    return { donation_id: quote.id, checkout_url: session.url };
  } catch (error) {
    const refusal = donor_refusal(error);
    if (!refusal) throw error;
    throw new AgentDonationError(refusal.code, refusal.reason);
  }
}

export async function donation_status(input: unknown) {
  const args = parsed(status_input, input);
  const donation = await donation_get(args.donation_id);
  if (donation?.source !== "bg-agent") {
    throw new AgentDonationError("not_found", "Donation not found.");
  }
  return {
    donation_id: donation.id,
    status: donation.status,
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
