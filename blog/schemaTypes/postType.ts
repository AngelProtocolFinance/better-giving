import { defineArrayMember, defineField, defineType } from "sanity";

export const postType = defineType({
  name: "post",
  title: "Post",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title" },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "author",
      type: "reference",
      to: [{ type: "author" }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "excerpt",
      type: "text",
      rows: 3,
      validation: (rule) => rule.max(300),
    }),
    defineField({
      name: "image",
      title: "Featured image",
      type: "image",
      options: { hotspot: true },
      fields: [defineField({ name: "alt", type: "string", title: "Alt text" })],
    }),
    defineField({
      name: "cta",
      title: "CTA",
      description:
        "Optional. Pick a CTA from the library to append to the bottom of the post.",
      type: "reference",
      to: [{ type: "cta" }],
    }),
    defineField({
      name: "body",
      type: "array",
      of: [
        defineArrayMember({ type: "block" }),
        defineArrayMember({
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({ name: "alt", type: "string", title: "Alt text" }),
            defineField({ name: "caption", type: "string" }),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "author.name", media: "image" },
  },
});
