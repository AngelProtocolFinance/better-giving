import { defineField, defineType } from "sanity";

const linkField = (name: string, title: string, required = false) =>
  defineField({
    name,
    title,
    type: "object",
    fields: [
      defineField({
        name: "label",
        type: "string",
        validation: (rule) => (required ? rule.required() : rule),
      }),
      defineField({
        name: "href",
        type: "url",
        validation: (rule) =>
          (required ? rule.required() : rule).uri({
            scheme: ["http", "https", "mailto", "tel"],
          }),
      }),
    ],
  });

export const ctaType = defineType({
  name: "cta",
  title: "CTA",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Internal title",
      description:
        "Operational label shown in the picker. Not visible to readers.",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "eyebrow",
      type: "string",
      description: "Small uppercase tagline above the heading",
    }),
    defineField({
      name: "heading",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "body",
      type: "text",
      rows: 3,
      description: "Optional supporting sentence under the heading",
    }),
    defineField({
      name: "image",
      type: "image",
      description:
        "Optional. Shown in the right column of the CTA card. Recommended: square, min 280×280 (renders at ~140px @2x). PNG with transparency or WebP.",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          title: "Alt text",
          validation: (rule) =>
            rule.custom((alt, ctx) => {
              const img = ctx.parent as { asset?: unknown } | undefined;
              if (img?.asset && !alt)
                return "Alt text required when image is set";
              return true;
            }),
        }),
      ],
    }),
    linkField("link1", "Primary link", true),
    linkField("link2", "Secondary link"),
  ],
  preview: {
    select: { title: "title", subtitle: "heading" },
  },
});
