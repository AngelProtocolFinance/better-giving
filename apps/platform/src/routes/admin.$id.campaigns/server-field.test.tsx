import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { CampaignForm, type ICampaignFormInit } from "./form";

const TAKEN = "That link is already used by another campaign.";
const PROGRAM = "That program is not on this nonprofit.";

const init: ICampaignFormInit = {
  name: "Winter",
  slug: "winter",
  campaign_type: "",
  description_pt: "A story of the drive",
  banner: "",
  logo: "",
  videos: [],
  ends_at: null,
  target: undefined,
  increments: [],
  donate_methods: ["stripe"],
  donate_frequencies: ["one-time"],
  hide_bg_tip: true,
  program_id: null,
};

afterEach(async () => {
  await cleanup();
});

function deferred() {
  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { hold, release: () => release() };
}

function mount(opts: {
  hold?: Promise<void>;
  respond: (body: { slug?: string; program_id?: string }) => {
    error: string;
    field: string;
  };
}) {
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/campaigns/edit",
      Component: () => (
        <CampaignForm
          init={init}
          programs={[
            { id: "11111111-1111-4111-8111-111111111111", title: "Meals" },
          ]}
          locked={false}
          status="draft"
          gift_count={0}
          fallback_methods={["stripe"]}
          fallback_frequencies={["one-time"]}
          settings_donation_to="/admin/7/settings?tab=donation"
          link_base="https://x.test/org/acme/"
        />
      ),
      action: async ({ request }) => {
        const body = (await request.json()) as {
          slug?: string;
          program_id?: string;
        };
        if (opts.hold) await opts.hold;
        return opts.respond(body);
      },
    },
    {
      path: "/admin/:id/settings",
      Component: () => <h1>Donation settings</h1>,
    },
  ]);
  return render(<Stub initialEntries={["/admin/7/campaigns/edit"]} />);
}

/** the node a control names as its error message */
function error_of(control: { element: () => Element }) {
  const id = control.element().getAttribute("aria-errormessage");
  return document.getElementById(id ?? "") as HTMLElement;
}

function frames() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

describe("campaign form server fields", () => {
  it("drops a link refusal edited while the save is in flight", async () => {
    const gate = deferred();
    const screen = await mount({
      hold: gate.hold,
      respond: () => ({ error: TAKEN, field: "slug" }),
    });
    const save = screen.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect.element(save).toHaveAttribute("aria-busy", "true");

    const link = screen.getByLabelText("Campaign link");
    await link.fill("winter-2");
    const name = screen.getByLabelText("Name");
    await name.click();
    gate.release();

    await expect.element(save).not.toHaveAttribute("aria-busy", "true");
    await frames();

    expect(screen.getByRole("alert").element().textContent ?? "").not.toContain(
      TAKEN
    );
    expect(
      page
        .elementLocator(error_of(link))
        .getByText(TAKEN, { exact: true })
        .query()
    ).toBeNull();
    expect(document.activeElement).toBe(name.element());
  });

  it("clears a link refusal once the link changes", async () => {
    const screen = await mount({
      respond: () => ({ error: TAKEN, field: "slug" }),
    });
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    const link = screen.getByLabelText("Campaign link");
    await expect.element(screen.getByRole("alert")).toHaveTextContent(TAKEN);
    await expect
      .element(
        page.elementLocator(error_of(link)).getByText(TAKEN, { exact: true })
      )
      .toBeVisible();
    await expect.element(link).toHaveFocus();

    await link.fill("winter-2");
    const name = screen.getByLabelText("Name");
    await name.click();
    await frames();

    expect(screen.getByRole("alert").element().textContent ?? "").not.toContain(
      TAKEN
    );
    expect(
      page
        .elementLocator(error_of(link))
        .getByText(TAKEN, { exact: true })
        .query()
    ).toBeNull();
    expect(document.activeElement).toBe(name.element());
  });

  it("keeps a program refusal until the program changes", async () => {
    const screen = await mount({
      respond: () => ({ error: PROGRAM, field: "program_id" }),
    });
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    const program = screen.getByRole("combobox", { name: "Program" });
    await expect.element(screen.getByRole("alert")).toHaveTextContent(PROGRAM);
    const root = (program.element() as HTMLElement).closest(".grid");
    await expect
      .element(
        page
          .elementLocator(root as HTMLElement)
          .getByText(PROGRAM, { exact: true })
      )
      .toBeVisible();

    await screen.getByLabelText("Name").fill("Spring");
    await frames();
    await expect.element(screen.getByRole("alert")).toHaveTextContent(PROGRAM);
    await expect
      .element(
        page
          .elementLocator(root as HTMLElement)
          .getByText(PROGRAM, { exact: true })
      )
      .toBeVisible();

    await program.click();
    await screen.getByRole("option", { name: "Meals" }).click();
    await frames();
    expect(screen.getByRole("alert").element().textContent ?? "").not.toContain(
      PROGRAM
    );
    expect(
      page
        .elementLocator(root as HTMLElement)
        .getByText(PROGRAM, { exact: true })
        .query()
    ).toBeNull();
  });
});
