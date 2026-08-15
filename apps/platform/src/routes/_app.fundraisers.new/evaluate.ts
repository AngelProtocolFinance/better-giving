import { valibotSchema } from "@ai-sdk/valibot";
import { generateText, Output } from "ai";
import * as v from "valibot";

interface IFundraiser {
  name: string;
  description: string;
}

const SPAM_CATEGORIES = [
  "commercial",
  "drugs",
  "ad",
  "terrorism",
  "fraud",
  "adult",
  "hate",
  "spam",
  "other",
] as const;

const evaluation_schema = v.strictObject({
  is_spam: v.pipe(v.boolean(), v.description("true=violation, false=ok")),
  spam_score: v.pipe(
    v.number(),
    v.description("0-1, 0.9+ for obvious violations")
  ),
  category: v.pipe(
    v.optional(v.picklist([...SPAM_CATEGORIES])),
    v.description("required if is_spam=true")
  ),
  /* rendered under the field the organizer typed in, and the only thing they
   * are told — so it has to name what to change. asked only for a verdict, the
   * model writes a log line and the organizer reads an internal note. */
  explanation: v.pipe(
    v.string(),
    v.description(
      "shown to the organizer beneath the field: address them and name what to change, max 10 words"
    )
  ),
  field: v.pipe(
    v.picklist(["name", "description"]),
    v.description("field with violation")
  ),
});

type IEvaluation = v.InferOutput<typeof evaluation_schema>;

const SYSTEM = `Nonprofit fundraiser moderator. Any language.
SPAM: commercial/sales, scams, phishing, contact harvesting, illegal (drugs/weapons/terrorism), adult/hate content, impersonation.
ALLOW: medical, charity, education, memorials, disaster relief, animals, faith-based, community, and appeals that name amounts, goals, deadlines or donor rewards.
Commercial intent means selling a product or service, which is distinct from asking for donations. Rough writing and typos are fine. When uncertain, allow.`;

const format = Output.object({ schema: valibotSchema(evaluation_schema) });

export const evaluate = async (
  fundraiser: IFundraiser
): Promise<IEvaluation> => {
  const { output } = await generateText({
    model: "anthropic/claude-haiku-4.5",
    output: format,
    system: SYSTEM,
    prompt: `Name: ${fundraiser.name}\nDesc: ${fundraiser.description}`,
    temperature: 0,
    maxRetries: 1,
  });

  return output as IEvaluation;
};
