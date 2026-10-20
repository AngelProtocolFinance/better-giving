const block = (
  type: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[]
) => ({
  type,
  description,
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["type", ...required],
    properties: {
      type: { const: type },
      ...properties,
    },
  },
});

/**
 * Only the block types this deployment's projection emits. A campaign carries
 * title, story, hero and a goal bar; the donation page carries the first three.
 */
export function block_catalog() {
  return {
    blocks: [
      block("title", "The page heading.", { text: { type: "string" } }, [
        "text",
      ]),
      block(
        "story",
        "The story behind the appeal, as stored.",
        { text: { type: "string" } },
        ["text"]
      ),
      block(
        "hero",
        "A large photo at the top of the page.",
        { image_url: { type: ["string", "null"] } },
        ["image_url"]
      ),
      block(
        "goal-bar",
        "A campaign's progress toward its goal. A campaign only.",
        {
          goal: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["amount", "currency"],
            properties: {
              amount: { type: "string" },
              currency: { const: "USD" },
            },
          },
        },
        ["goal"]
      ),
    ],
  };
}
