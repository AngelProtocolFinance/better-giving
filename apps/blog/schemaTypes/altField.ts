import { type CustomValidator, defineField } from "sanity";

// optional on an empty image; required once an asset is set
const requireAltWithAsset: CustomValidator<string | undefined> = (alt, ctx) => {
  const img = ctx.parent as { asset?: unknown } | undefined;
  if (img?.asset && !alt?.trim()) return "Required when an image is set";
  return true;
};

const altFieldBase = {
  name: "alt",
  type: "string",
  title: "Alt text",
  description:
    "Describe what the image shows or why it's there. Don't repeat the title or caption.",
} as const;

// warning, not error: posts published without alt would otherwise block republishing on any edit
export const altField = defineField({
  ...altFieldBase,
  validation: (rule) => rule.custom(requireAltWithAsset).warning(),
});

export const ctaAltField = defineField({
  ...altFieldBase,
  validation: (rule) => rule.custom(requireAltWithAsset).error(),
});
