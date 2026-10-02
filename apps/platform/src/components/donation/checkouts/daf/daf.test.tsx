import { AskHost } from "@better-giving/ui";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { createRoutesStub, href } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import { resp } from "@/helpers/https";
import type { Config, DafDonationDetails } from "../../types";
import { ChariotCheckout } from ".";

const don_set_mock = vi.hoisted(() => vi.fn());
const don_mock = vi.hoisted(() => ({
  recipient: { id: "1", name: "test", members: [] },
  source: "bg-marketplace",
  mode: "live",
  config: null as Config | null,
  base_url: "https://test.example.com",
}));
vi.mock("../../context", () => ({
  use_donation: vi
    .fn()
    .mockReturnValue({ don: don_mock, don_set: don_set_mock }),
}));

// leaving for the thank-you page is one shared helper with its own tests
// (../../common/redirect.test.ts) — what's asserted here is what the donor is
// left looking at when it reports back that the browser never left.
const redirect_mock = vi.hoisted(() => vi.fn());
vi.mock("../../common/redirect", () => ({
  use_donation_redirect: () => redirect_mock,
}));

const CDN_SRC = "https://cdn.givechariot.com/chariot-connect.umd.js";

const fv: DafDonationDetails = {
  amount: "100",
  tip: "",
  tip_format: "none",
  cover_processing_fee: false,
};

/** what chariot hands back on CHARIOT_SUCCESS — a grant that has already been
 * recommended, in cents, with the donor's details off their daf account. */
const success_detail = {
  workflowSessionId: "ws_1",
  grantIntent: {
    amount: 10_000,
    metadata: {
      don_id: "11111111-1111-4111-8111-111111111111",
      amount: { base: 100, tip: 0, fee_allowance: 0 },
    },
  },
  user: {
    firstName: "John",
    lastName: "Doe",
    email: "john@doe.com",
    address: {
      line1: "1 Main St",
      line2: "",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    },
  },
};

// the checkout's prompts are raised through `ask`, which mounts at `AskHost`
const stb = (node: ReactNode) =>
  createRoutesStub([
    {
      path: "/",
      Component: () => (
        <>
          {node}
          <AskHost />
        </>
      ),
      HydrateFallback: () => null,
    },
  ]);

describe("daf checkout: a grant that goes through but never lands", () => {
  afterEach(() => {
    redirect_mock.mockReset();
    for (const s of document.querySelectorAll(`script[src="${CDN_SRC}"]`)) {
      s.remove();
    }
  });

  /** the panel waits on chariot's cdn script. seeding a tag it already
   * recognizes skips the load entirely — `type` keeps the browser from
   * fetching a src it can't execute, so no test ever reaches the network. */
  const seed_script = () => {
    const s = document.createElement("script");
    s.type = "text/plain";
    s.src = CDN_SRC;
    document.head.appendChild(s);
  };

  test("the way to the receipt outlives the modal, and the widget stays up", async () => {
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        HttpResponse.json({ id: "don_1" })
      )
    );
    redirect_mock.mockImplementation((x: { on_stuck?: () => void }) =>
      x.on_stuck?.()
    );
    seed_script();

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);

    const el = await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    );
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", { detail: success_detail })
    );

    // told the truth: the grant moved, so this is never worded as a failure
    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toMatchTextContent(/donation went through/i);

    // dismissing it can't be what takes the receipt away: the donor keeps
    // reading "your donation went through" on the panel itself.
    await screen.getByRole("button", { name: /^done$/i }).click();
    await vi.waitFor(() =>
      expect(screen.getByRole("dialog").query()).toBeNull()
    );
    await expect
      .element(screen.getByText(/donation went through/i))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /receipt/i }))
      .toHaveAttribute("href", "https://test.example.com/donations/don_1");

    // never unmounted from under the donor: it owns an out-of-page session
    const el2 = screen.container.querySelector("chariot-connect");
    expect(el2).not.toBeNull();
    // ...but it can't be launched again. the grant is already recommended;
    // a second one spends the donor's fund twice.
    expect(el2!.closest("[inert]")).not.toBeNull();
  });

  test("the launcher is dead from the moment the grant is recommended, not from the moment we give up on the receipt", async () => {
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        HttpResponse.json({ id: "don_1" })
      )
    );
    // the redirect is still trying: it has neither landed nor reported back.
    // this is up to nine seconds long, and it's the window a donor sits in
    // wondering whether anything happened at all.
    redirect_mock.mockImplementation(() => {});
    seed_script();

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);

    const el = await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    );
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", { detail: success_detail })
    );

    await vi.waitFor(() =>
      expect(
        screen.container.querySelector("chariot-connect")?.closest("[inert]")
      ).not.toBeNull()
    );

    // and not yet worded as a failure — the browser may still be on its way
    expect(screen.getByText(/couldn't open your receipt/i).query()).toBeNull();
  });

  test("a donor connect returns with no address still gets their grant recorded", async () => {
    let body: { donor: { email: string; address?: unknown } } | undefined;
    mswWorker.use(
      http.post(href("/api/donation-intents"), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: "don_1" });
      })
    );
    seed_script();

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);

    const el = await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    );
    const { address: _, ...no_address } = success_detail.user;
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", {
        detail: { ...success_detail, user: no_address },
      })
    );

    const posted = await vi.waitUntil(() => body);
    expect(posted.donor.email).toBe("john@doe.com");
    expect(posted.donor.address).toBeUndefined();
  });

  test("a refusal the server answers before any grant exists leaves the launcher live, and says why", async () => {
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        resp.refuse("DAF grants must be a whole dollar amount", 400)
      )
    );
    seed_script();

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);

    const el = await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    );
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", { detail: success_detail })
    );

    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(/whole dollar amount/i);
    expect(
      screen.container.querySelector("chariot-connect")?.closest("[inert]")
    ).toBeNull();
    expect(redirect_mock).not.toHaveBeenCalled();
  });

  test("an error from the server still kills the launcher, and says so", async () => {
    // the grant may exist at chariot even though recording it failed
    mswWorker.use(
      http.post(href("/api/donation-intents"), () =>
        HttpResponse.text("recording failed", { status: 500 })
      )
    );
    seed_script();

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);

    const el = await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    );
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", { detail: success_detail })
    );

    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(/error occurred while processing donation/i);
    expect(
      screen.container.querySelector("chariot-connect")?.closest("[inert]")
    ).not.toBeNull();
    expect(redirect_mock).not.toHaveBeenCalled();
  });
});

describe("daf checkout: the launcher comes back only on a refusal it can read", () => {
  afterEach(() => {
    for (const s of document.querySelectorAll(`script[src="${CDN_SRC}"]`)) {
      s.remove();
    }
  });

  /** posts the recommended grant against `answer` and returns the screen once
   * the donor is looking at the error prompt */
  const answered_with = async (answer: () => Response | Promise<Response>) => {
    mswWorker.use(http.post(href("/api/donation-intents"), answer));
    const s = document.createElement("script");
    s.type = "text/plain";
    s.src = CDN_SRC;
    document.head.appendChild(s);

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);
    const el = await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    );
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", { detail: success_detail })
    );
    return screen;
  };

  const launcher_inert = (container: HTMLElement) =>
    container.querySelector("chariot-connect")?.closest("[inert]") ?? null;

  test("a request that never gets an answer keeps the launcher dead", async () => {
    // the server may have made the grant and lost the response on the way back
    const screen = await answered_with(() => HttpResponse.error());

    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(/error occurred while processing donation/i);
    expect(launcher_inert(screen.container)).not.toBeNull();
    expect(redirect_mock).not.toHaveBeenCalled();
  });

  test.each([
    [401, "Unauthorized"],
    [409, "Conflict"],
    [429, "Too Many Requests"],
  ])(
    "a %i the route never sends keeps the launcher dead",
    async (status, text) => {
      // answered by something in front of the route, which may already have run
      const screen = await answered_with(() =>
        HttpResponse.text(text, { status })
      );

      await expect
        .element(screen.getByRole("dialog"))
        .toMatchTextContent(/error occurred while processing donation/i);
      expect(launcher_inert(screen.container)).not.toBeNull();
    }
  );

  test("a 400 page from in front of the route never reaches the donor, and keeps the launcher dead", async () => {
    const screen = await answered_with(() =>
      HttpResponse.text(
        "<html><body>Request blocked by edge-waf-7</body></html>",
        {
          status: 400,
        }
      )
    );

    const dialog = screen.getByRole("dialog");
    await expect
      .element(dialog)
      .toMatchTextContent(/error occurred while processing donation/i);
    expect(dialog.element().textContent).not.toMatch(/edge-waf-7/);
    expect(launcher_inert(screen.container)).not.toBeNull();
  });

  test("chariot's 410 for an expired session leaves the launcher live, and says why", async () => {
    const screen = await answered_with(() =>
      resp.refuse(
        "Your fund couldn't make this grant. Please check the amount and try again.",
        410
      )
    );

    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(/couldn't make this grant/i);
    expect(launcher_inert(screen.container)).toBeNull();
  });

  test("a closed recipient's 404 leaves the launcher live, and says why", async () => {
    const screen = await answered_with(() =>
      resp.refuse("This nonprofit isn't accepting donations right now.", 404)
    );

    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(/isn't accepting donations/i);
    expect(launcher_inert(screen.container)).toBeNull();
  });
});

describe("daf checkout: the grant is what the summary shows, in whole dollars", () => {
  afterEach(() => {
    for (const s of document.querySelectorAll(`script[src="${CDN_SRC}"]`)) {
      s.remove();
    }
  });

  interface IConnectRequest {
    amount: number;
    metadata: {
      don_id: string;
      amount: { base: number; tip: number; fee_allowance: number };
    };
  }

  /** renders the checkout and asks it for what it pre-populates connect with */
  const open_connect = async (details: DafDonationDetails) => {
    const s = document.createElement("script");
    s.type = "text/plain";
    s.src = CDN_SRC;
    document.head.appendChild(s);

    const Stub = stb(<ChariotCheckout {...details} />);
    const screen = await render(<Stub />);

    const el = (await vi.waitUntil(() =>
      screen.container.querySelector("chariot-connect")
    )) as HTMLElement & { onDonationRequest: unknown };
    let request: (() => Promise<unknown>) | undefined;
    el.onDonationRequest = (cb: () => Promise<unknown>) => {
      request = cb;
    };
    el.dispatchEvent(new CustomEvent("CHARIOT_INIT"));
    const grant = (await request?.()) as IConnectRequest;

    const total_dt = [...screen.container.querySelectorAll("dt")].find((dt) =>
      /^total\s+charge$/i.test(dt.textContent?.trim() ?? "")
    );
    const summary_total =
      total_dt?.parentElement?.querySelector("dd")?.textContent;
    return { el, grant, summary_total };
  };

  test("$10 with the fee covered is an $11 grant, the rounding on the fee allowance", async () => {
    const { grant, summary_total } = await open_connect({
      ...fv,
      amount: "10",
      cover_processing_fee: true,
    });
    expect(summary_total).toBe("$11.00");
    expect(grant.amount).toBe(1100);
    expect(grant.metadata.amount).toEqual({
      base: 10,
      tip: 0,
      fee_allowance: 1,
    });
  });

  test("$10 with a 10% tip and no fee cover is an $11 grant", async () => {
    const { grant, summary_total } = await open_connect({
      ...fv,
      amount: "10",
      tip_format: "10",
    });
    expect(summary_total).toBe("$11.00");
    expect(grant.amount).toBe(1100);
  });

  test("$10 with a 15% tip is a $12 grant, the rounding on the tip", async () => {
    const { grant, summary_total } = await open_connect({
      ...fv,
      amount: "10",
      tip_format: "15",
    });
    expect(summary_total).toBe("$12.00");
    expect(grant.amount).toBe(1200);
    expect(grant.metadata.amount).toEqual({
      base: 10,
      tip: 2,
      fee_allowance: 0,
    });
  });

  test("with a tip and the fee covered, the rounding goes on the fee allowance, not the tip", async () => {
    const { grant, summary_total } = await open_connect({
      ...fv,
      amount: "10",
      tip_format: "15",
      cover_processing_fee: true,
    });
    expect(summary_total).toBe("$12.00");
    expect(grant.amount).toBe(1200);
    expect(grant.metadata.amount).toEqual({
      base: 10,
      tip: 1.5,
      fee_allowance: 0.5,
    });
  });

  test("$10 with nothing added is a $10 grant", async () => {
    const { grant, summary_total } = await open_connect({
      ...fv,
      amount: "10",
    });
    expect(summary_total).toBe("$10.00");
    expect(grant.amount).toBe(1000);
    expect(grant.metadata.amount).toEqual({
      base: 10,
      tip: 0,
      fee_allowance: 0,
    });
  });

  /** what the checkout posts once chariot reports the grant authorized */
  const posted_intent = async (
    el: HTMLElement,
    grantIntent: IConnectRequest
  ) => {
    let body: { amount: IConnectRequest["metadata"]["amount"] } | undefined;
    mswWorker.use(
      http.post(href("/api/donation-intents"), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: "don_1" });
      })
    );
    el.dispatchEvent(
      new CustomEvent("CHARIOT_SUCCESS", {
        detail: { ...success_detail, grantIntent },
      })
    );
    return vi.waitUntil(() => body);
  };

  test("the intent posted after the donor authorizes adds up to the grant the summary showed", async () => {
    const { el, grant, summary_total } = await open_connect({
      ...fv,
      amount: "10",
      tip_format: "15",
      cover_processing_fee: true,
    });
    const intent = await posted_intent(el, grant);

    expect(summary_total).toBe("$12.00");
    expect(grant.amount).toBe(1200);
    expect(intent.amount).toEqual({ base: 10, tip: 1.5, fee_allowance: 0.5 });
  });

  test("a grant the donor changed in connect is split into whole cents that add up to it", async () => {
    const { el, grant } = await open_connect({
      ...fv,
      amount: "10",
      tip_format: "15",
      cover_processing_fee: true,
    });
    // 10 : 1.5 : 0.5 of $20 is 16.666… : 2.5 : 0.833…
    const intent = await posted_intent(el, { ...grant, amount: 2000 });

    expect(intent.amount).toEqual({
      base: 16.67,
      tip: 2.5,
      fee_allowance: 0.83,
    });
  });
});

describe("daf checkout: a second launch while the first intent is in flight", () => {
  afterEach(() => {
    redirect_mock.mockReset();
    for (const s of document.querySelectorAll(`script[src="${CDN_SRC}"]`)) {
      s.remove();
    }
  });

  // chariot's element is a custom element the cdn script defines; the script is
  // never loaded here, so this stands in for it with the one behavior that
  // matters: a launch button inside its shadow root that reports a recommended
  // grant. defined once for the rest of the file's page.
  if (!customElements.get("chariot-connect")) {
    customElements.define(
      "chariot-connect",
      class extends HTMLElement {
        connectedCallback() {
          const btn = document.createElement("button");
          btn.textContent = "Launch DAF";
          btn.addEventListener("click", () =>
            this.dispatchEvent(
              new CustomEvent("CHARIOT_SUCCESS", { detail: success_detail })
            )
          );
          this.attachShadow({ mode: "open" }).appendChild(btn);
        }
      }
    );
  }

  test("the launcher goes inert before the intent is answered, so a second launch cannot make a second intent", async () => {
    const posted: unknown[] = [];
    let answer!: () => void;
    const answered = new Promise<void>((r) => {
      answer = r;
    });
    mswWorker.use(
      http.post(href("/api/donation-intents"), async ({ request }) => {
        posted.push(await request.json());
        await answered;
        return HttpResponse.json({ id: "don_1" });
      })
    );
    redirect_mock.mockImplementation(() => {});
    const s = document.createElement("script");
    s.type = "text/plain";
    s.src = CDN_SRC;
    document.head.appendChild(s);

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);
    const launch = screen.getByRole("button", { name: /launch daf/i });
    // `closest` stops at the shadow boundary, so inertness is read off the host
    const host = screen.container.querySelector("chariot-connect")!;

    await launch.click();
    await vi.waitFor(() => expect(posted).toHaveLength(1));

    // the first intent has no answer yet. `inert` is what stops the second
    // click: it shuts out pointer and keyboard, where a programmatic click()
    // still reaches the handler, which holds no latch of its own.
    await vi.waitFor(() => expect(host.closest("[inert]")).not.toBeNull());
    // and the donor cannot reach it by role either
    expect(
      screen.getByRole("button", { name: /launch daf/i }).query()
    ).toBeNull();

    answer();
    await vi.waitFor(() => expect(redirect_mock).toHaveBeenCalledOnce());
    expect(posted).toHaveLength(1);
  });

  test("a refusal that made no grant brings the launcher back, and a second launch posts a second intent", async () => {
    // the live read for the test above: the same click does post when nothing
    // has been sent, so one intent there is the guard and not a dead button
    const posted: unknown[] = [];
    let refuse_first = true;
    mswWorker.use(
      http.post(href("/api/donation-intents"), async ({ request }) => {
        posted.push(await request.json());
        if (refuse_first) {
          refuse_first = false;
          return resp.refuse("Your fund couldn't make this grant.", 410);
        }
        return HttpResponse.json({ id: "don_1" });
      })
    );
    redirect_mock.mockImplementation(() => {});
    const s = document.createElement("script");
    s.type = "text/plain";
    s.src = CDN_SRC;
    document.head.appendChild(s);

    const Stub = stb(<ChariotCheckout {...fv} />);
    const screen = await render(<Stub />);
    const launch = screen.getByRole("button", { name: /launch daf/i });

    await launch.click();
    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(/couldn't make this grant/i);
    (
      screen
        .getByRole("button", { name: "Ok", exact: true })
        .element() as HTMLElement
    ).click();
    await vi.waitFor(() =>
      expect(screen.getByRole("dialog").query()).toBeNull()
    );
    await launch.click();

    await vi.waitFor(() => expect(posted).toHaveLength(2));
  });
});
