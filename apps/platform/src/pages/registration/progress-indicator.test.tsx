import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { IReg } from "@/reg";
import { ProgressIndicator } from "./progress-indicator";

async function render_at(
  url_step: number,
  o_type: IReg["o_type"],
  step: 1 | 2 | 3 | 4 | 5
) {
  const Stub = createRoutesStub([
    {
      path: "/register/:reg_id/:step",
      HydrateFallback: () => null,
      Component: () => <ProgressIndicator step={step} o_type={o_type} />,
    },
  ]);
  const screen = await render(
    <Stub initialEntries={[`/register/abc/${url_step}`]} />
  );
  return {
    labels: [...screen.container.querySelectorAll("[data-scope='steps'] span")]
      .map((el) => el.textContent?.trim())
      .filter(Boolean),
    current: screen.container.querySelector("[data-curr]")?.textContent?.trim(),
  };
}

describe("ProgressIndicator", () => {
  it("gives a 501(c)(3) four steps with no agreement among them", async () => {
    expect((await render_at(4, "501c3", 4)).labels).toEqual([
      "Contact Details",
      "Organization",
      "Banking",
      "Review",
    ]);
  });

  it("gives an international org five steps including the agreement", async () => {
    expect((await render_at(4, "other", 4)).labels).toEqual([
      "Contact Details",
      "Organization",
      "Fiscal Sponsorship",
      "Banking",
      "Review",
    ]);
  });

  // url step 4 is banking for everyone, but it is the 3rd label for a
  // 501(c)(3) and the 4th for an international org — get the shift wrong and
  // the highlight sits on the wrong row for every US applicant past step 2.
  it("highlights banking at url step 4 for a 501(c)(3)", async () => {
    expect((await render_at(4, "501c3", 4)).current).toContain("Banking");
  });

  it("highlights banking at url step 4 for an international org", async () => {
    expect((await render_at(4, "other", 4)).current).toContain("Banking");
  });

  it("highlights review at url step 5 for a 501(c)(3)", async () => {
    expect((await render_at(5, "501c3", 5)).current).toContain("Review");
  });

  it("highlights review at url step 5 for an international org", async () => {
    expect((await render_at(5, "other", 5)).current).toContain("Review");
  });

  it("highlights the agreement at url step 3 for an international org", async () => {
    expect((await render_at(3, "other", 3)).current).toContain(
      "Fiscal Sponsorship"
    );
  });

  it("highlights contact at url step 1", async () => {
    expect((await render_at(1, "501c3", 1)).current).toContain(
      "Contact Details"
    );
  });
});
