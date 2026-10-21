import { safeParse } from "valibot";
import { describe, expect, it } from "vitest";
import { form_schema } from "./form-schema";
import { campaign_body } from "./schema";

const LINK = "Enter the end of the link. Use letters, numbers, and - . _ ~.";

describe("campaign field messages", () => {
  it("asks for a name, a link, and a story", () => {
    const server = safeParse(campaign_body, {
      name: "",
      slug: "",
      description_pt: "",
      donate_methods: ["stripe"],
      donate_frequencies: ["one-time"],
      target: "0",
    });
    const messages = server.issues?.map((issue) => issue.message) ?? [];
    expect(messages).toContain("Enter a name.");
    expect(messages).toContain(LINK);
    expect(messages).toContain("Enter a story.");

    const client = safeParse(form_schema, {
      name: " ",
      slug: "",
      description: { value: "" },
      banner: "",
      logo: "",
      videos: [],
      target: { type: "none" },
      increments: [],
      donate_methods: [{ id: "stripe", name: "Card", disabled: false }],
      freqs: [true, false, false, false],
      hide_bg_tip: false,
      program_id: "",
      campaign_type: "",
    });
    const client_messages = client.issues?.map((issue) => issue.message) ?? [];
    expect(client_messages).toContain("Enter a name.");
    expect(client_messages).toContain(LINK);
    expect(client_messages).toContain("Enter a story.");
  });

  it("asks for an https link when a banner is not a url", () => {
    const server = safeParse(campaign_body, {
      name: "Winter",
      slug: "winter",
      description_pt: "A story",
      banner: "not a link",
      donate_methods: ["stripe"],
      donate_frequencies: ["one-time"],
      target: "0",
    });
    const banner = server.issues?.find((issue) =>
      issue.path?.some((step) => step.key === "banner")
    );
    expect(banner?.message).toBe("Enter a valid https link.");
  });
});
