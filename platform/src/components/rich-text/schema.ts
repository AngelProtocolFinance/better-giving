import { defineSchema } from "@portabletext/editor";

// shared between editor + renderer so toolbar capabilities and read-only
// styling are guaranteed to align.
export const pt_schema = defineSchema({
  decorators: [{ name: "strong" }, { name: "em" }],
  styles: [{ name: "normal" }],
  annotations: [{ name: "link", fields: [{ name: "href", type: "string" }] }],
  lists: [{ name: "bullet" }, { name: "number" }],
  inlineObjects: [],
  blockObjects: [],
});
