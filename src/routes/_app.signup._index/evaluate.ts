import { valibotSchema } from "@ai-sdk/valibot";
import { generateText, Output } from "ai";
import * as v from "valibot";

interface ISignupData {
  first_name: string;
  last_name: string;
  email: string;
}

const SPAM_CATEGORIES = [
  "fake_name",
  "test_account",
  "profanity",
  "spam",
  "bot",
  "suspicious_email",
  "other",
] as const;

const evaluation_schema = v.strictObject({
  is_spam: v.pipe(v.boolean(), v.description("true=reject, false=allow")),
  spam_score: v.pipe(
    v.number(),
    v.description("0-1, 0.9+ for obvious violations")
  ),
  category: v.pipe(
    v.optional(v.picklist([...SPAM_CATEGORIES])),
    v.description("required if is_spam=true")
  ),
  explanation: v.pipe(v.string(), v.description("max 8 words")),
  field: v.pipe(
    v.picklist(["first_name", "last_name", "email"]),
    v.description("field with issue")
  ),
});

type IEvaluation = v.InferOutput<typeof evaluation_schema>;

const SYSTEM = `Nonprofit signup validator. Any language.
REJECT: gibberish/fake names, test accounts (test/asdf/xxx), bots, profanity, disposable/temp emails, spam patterns, excessive numbers/symbols, URLs/domains/links in names, emoji in names, currency amounts/symbols in names, marketing/scam language in names.
ALLOW: real names (all cultures), legitimate emails, minor typos.
Culturally aware—non-English names are valid. When uncertain, allow.`;

const format = Output.object({ schema: valibotSchema(evaluation_schema) });

export const evaluate = async (data: ISignupData): Promise<IEvaluation> => {
  const { output } = await generateText({
    model: "anthropic/claude-haiku-4.5",
    output: format,
    system: SYSTEM,
    prompt: `First: ${data.first_name}\nLast: ${data.last_name}\nEmail: ${data.email}`,
    temperature: 0,
    maxRetries: 1,
  });

  return output as IEvaluation;
};
