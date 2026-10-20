import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Socials } from "./socials";

const names = [
  "Facebook",
  "LinkedIn",
  "X",
  "Discord",
  "Instagram",
  "YouTube",
  "TikTok",
] as const;

describe("Socials", () => {
  test("names each icon link", async () => {
    const screen = await render(
      <Socials
        social_media_urls={{
          facebook: "https://facebook.com/example",
          linkedin: "https://www.linkedin.com/company/example",
          twitter: "https://x.com/example",
          discord: "https://discord.gg/example",
          instagram: "https://www.instagram.com/example",
          youtube: "https://www.youtube.com/@example",
          tiktok: "https://www.tiktok.com/@example",
        }}
      />
    );

    for (const name of names) {
      await expect
        .element(screen.getByRole("link", { name, exact: true }))
        .toBeVisible();
    }
    expect(screen.getByRole("link").elements()).toHaveLength(names.length);
  });
});
