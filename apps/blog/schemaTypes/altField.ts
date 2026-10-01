import { type CustomValidator, defineField } from "sanity";

// optional on an empty image; required once an asset is set
export const requireAltWithAsset: CustomValidator<string | undefined> = (
  alt,
  ctx
) => {
  const img = ctx.parent as { asset?: unknown } | undefined;
  if (img?.asset && !alt) return "Alt text required when image is set";
  return true;
};

export const altField = defineField({
  name: "alt",
  type: "string",
  title: "Alt text",
  validation: (rule) => rule.custom(requireAltWithAsset),
});
