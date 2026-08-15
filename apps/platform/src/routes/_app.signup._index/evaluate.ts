import { valibotSchema } from "@ai-sdk/valibot";
import { generateText, Output } from "ai";
import * as v from "valibot";

interface ISignupData {
  first_name: string;
  last_name: string;
  email: string;
}

interface IOrgData {
  o_name: string;
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

/** every verdict answers the same four questions; only the field it can blame
 * changes with what was submitted. one definition so the two cannot drift. */
const verdict = {
  is_spam: v.pipe(v.boolean(), v.description("true=reject, false=allow")),
  spam_score: v.pipe(
    v.number(),
    v.description("0-1, 0.9+ for obvious violations")
  ),
  category: v.pipe(
    v.optional(v.picklist([...SPAM_CATEGORIES])),
    v.description("required if is_spam=true")
  ),
  /* rendered under the field the applicant typed in, and the only thing they
   * are told — so it has to name what to change. asked only for a verdict, the
   * model writes a log line and the applicant reads an internal note. */
  explanation: v.pipe(
    v.string(),
    v.description(
      "shown to the applicant beneath the field: address them and name what to change, max 8 words"
    )
  ),
};

const person_schema = v.strictObject({
  ...verdict,
  field: v.pipe(
    v.picklist(["first_name", "last_name", "email"]),
    v.description("field with issue")
  ),
});

const org_schema = v.strictObject({
  ...verdict,
  field: v.pipe(
    v.picklist(["o_name", "email"]),
    v.description("field with issue")
  ),
});

type IEvaluation = v.InferOutput<typeof person_schema>;
type IOrgEvaluation = v.InferOutput<typeof org_schema>;

/* the ban list and the allowance are kept about the same length on purpose: a
 * long list of what to refuse beside a short one of what to accept pulls every
 * borderline verdict toward reject, which is how a real applicant gets
 * turned away. */
const REFUSE = `REJECT: gibberish, placeholder or padded entries (test/asdf/xxx, long digit runs), profanity, a name used as ad space (links, emoji, prices, marketing copy), disposable or temp email domains.`;

const PERSON = `Nonprofit signup validator. A person is signing up: their name and an email, in any language or script.
${REFUSE}
ALLOW: names from every culture and script, single-word and very short names, unfamiliar spellings, hyphens, apostrophes, particles and honorifics, minor typos, ordinary personal and work email.
When uncertain, allow.`;

const ORG = `Nonprofit lead validator. An organization is applying: its name and a work email, in any language or script.
${REFUSE}
ALLOW: any plausible organization name — charity, foundation, trust, church, school, community group — including ordinary words used as a name, acronyms, initials, and names that read like a phrase. The name here is an organization's.
When uncertain, allow.`;

const person_format = Output.object({ schema: valibotSchema(person_schema) });
const org_format = Output.object({ schema: valibotSchema(org_schema) });

export const evaluate = async (data: ISignupData): Promise<IEvaluation> => {
  const { output } = await generateText({
    model: "anthropic/claude-haiku-4.5",
    output: person_format,
    system: PERSON,
    prompt: `First: ${data.first_name}\nLast: ${data.last_name}\nEmail: ${data.email}`,
    temperature: 0,
    maxRetries: 1,
  });

  return output as IEvaluation;
};

/** the lead forms submit an organization, so they get a prompt that expects
 * one — an organization name handed to the person validator reads to it as a
 * fake name, and a real applicant is refused. */
export const evaluate_org = async (data: IOrgData): Promise<IOrgEvaluation> => {
  const { output } = await generateText({
    model: "anthropic/claude-haiku-4.5",
    output: org_format,
    system: ORG,
    prompt: `Organization: ${data.o_name}\nEmail: ${data.email}`,
    temperature: 0,
    maxRetries: 1,
  });

  return output as IOrgEvaluation;
};
