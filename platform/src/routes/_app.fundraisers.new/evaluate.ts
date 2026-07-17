import { valibotSchema } from "@ai-sdk/valibot";
import { generateText, Output } from "ai";
import * as v from "valibot";

interface IFundraiser {
  title: string;
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
  explanation: v.pipe(v.string(), v.description("max 10 words")),
  field: v.pipe(
    v.picklist(["name", "description"]),
    v.description("field with violation")
  ),
});

type IEvaluation = v.InferOutput<typeof evaluation_schema>;

const SYSTEM = `Nonprofit fundraiser moderator. Flag violations. Any language.
SPAM: commercial/sales, scams, phishing, spam patterns, contact harvesting, illegal (drugs/weapons/terrorism), adult/hate content, impersonation.
ALLOW: medical, charity, education, memorials, disaster relief, animals, faith-based, community.
Strict on commercial intent. Typos≠spam. When uncertain, allow.`;

const format = Output.object({ schema: valibotSchema(evaluation_schema) });

export const evaluate = async (
  fundraiser: IFundraiser
): Promise<IEvaluation> => {
  const { output } = await generateText({
    model: "anthropic/claude-haiku-4.5",
    output: format,
    system: SYSTEM,
    prompt: `Title: ${fundraiser.title}\nDesc: ${fundraiser.description}`,
    temperature: 0,
    maxRetries: 1,
  });

  return output as IEvaluation;
};
