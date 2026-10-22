import type { ComponentType } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: ComponentType) => Component,
  createClientLoaderCache: () => () => null,
}));
vi.mock("./api", () => ({ loader: () => null, headers: () => ({}) }));

import ProgramPage from "./route";

const data = (prog: object) => ({
  npo: { id: 7, slug: "acme", name: "Acme Relief", logo: null },
  url: "https://x/org/acme/program/p1",
  prog: {
    id: "p1",
    title: "Wells",
    description_pt: "[]",
    milestones: [],
    ...prog,
  },
});

function mount(prog: object) {
  const Stub = createRoutesStub([
    {
      path: "/org/:org/program/:program_id",
      Component: ProgramPage as never,
      loader: () => data(prog),
    },
  ]);
  return render(<Stub initialEntries={["/org/acme/program/p1"]} />);
}

describe("program page", () => {
  it("has no milestones or target card when it has neither", async () => {
    const screen = await mount({});
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Wells" }))
      .toBeVisible();
    expect(screen.getByRole("heading", { name: "Milestones" }).query()).toBe(
      null
    );
    expect(screen.getByRole("progressbar").query()).toBeNull();
    for (const el of screen
      .getByRole("link", { name: "Donate to this program" })
      .elements()) {
      expect(el.getAttribute("href")).toBe("/donate/7?programId=p1");
    }
    await expect
      .element(screen.getByRole("banner").getByRole("link"))
      .toHaveAttribute("href", "/org/acme");
  });

  it("shows the target card and a milestone timeline", async () => {
    const screen = await mount({
      target_raise: 500,
      total_donations: 100,
      milestones: [
        {
          title: "Drill first well",
          description_pt: "[]",
          date: "2020-01-02T00:00:00.000Z",
        },
      ],
    });
    await expect
      .element(screen.getByText("of $500 target", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("progressbar", { name: "Amount received" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Milestones" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Drill first well" }))
      .toBeVisible();
    await expect.element(screen.getByText("Jan 2, 2020")).toBeVisible();
  });
});
