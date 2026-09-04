import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ACK_TYPE,
  type IRedirectWin,
  NAV_GRACE_MS,
  PARENT_GRACE_MS,
  redirect_after_donation,
} from "./redirect";
import type { IDonationDest } from "./return-url";

const ours: IDonationDest = {
  url: "https://better.giving/donations/ord_1",
  is_custom: false,
};
const theirs: IDonationDest = {
  url: "https://npo.org/thanks?donation_amount=25",
  is_custom: true,
};

/** a document the helper can drive without navigating the test runner.
 * `window.top` is unforgeable, so a framed document can't be faked on the real
 * window — the helper takes this slice instead. events are the browser's own:
 * `PageTransitionEvent` carries the `persisted` flag the freeze path turns on. */
const fake_win = (framed: boolean) => {
  const posted: unknown[] = [];
  const targets: string[] = [];
  const on = new Map<string, Set<(e: unknown) => void>>();
  const doc = {} as unknown;
  const fire = (type: string, e: unknown) => {
    for (const fn of [...(on.get(type) ?? [])]) fn(e);
  };
  const win: IRedirectWin = {
    self: doc,
    top: framed ? ({} as unknown) : doc,
    parent: {
      postMessage: (msg: unknown, target: string) => {
        posted.push(msg);
        targets.push(target);
      },
    },
    location: { href: "about:blank" },
    addEventListener: ((t: string, fn: (e: unknown) => void) => {
      if (!on.has(t)) on.set(t, new Set());
      on.get(t)?.add(fn);
    }) as Window["addEventListener"],
    removeEventListener: ((t: string, fn: (e: unknown) => void) => {
      on.get(t)?.delete(fn);
    }) as Window["removeEventListener"],
  };
  return {
    win,
    posted,
    targets,
    /** the document is going away for good — the browser drops its timers */
    unload: () =>
      fire(
        "pagehide",
        new PageTransitionEvent("pagehide", { persisted: false })
      ),
    /** the tab was backgrounded and the page frozen, timers with it. what a
     * wallet sheet taking over on mobile safari looks like from in here. */
    freeze: () =>
      fire(
        "pagehide",
        new PageTransitionEvent("pagehide", { persisted: true })
      ),
    resume: () =>
      fire(
        "pageshow",
        new PageTransitionEvent("pageshow", { persisted: true })
      ),
    /** the host page answering our redirect message */
    ack: (form_id?: string) =>
      fire("message", { data: { type: ACK_TYPE, form_id } }),
  };
};

describe("post-donation redirect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a top-level document goes straight to the thank-you page", () => {
    const f = fake_win(false);

    redirect_after_donation({ dest: ours, form_id: "form_1", win: f.win });

    expect(f.win.location.href).toBe(ours.url);
    // nothing to tell a parent about — there isn't one
    expect(f.posted).toHaveLength(0);
  });

  test("a basic embed goes to the receipt without asking anyone", () => {
    // no `parent_origin` means no `form-embed.js` built this frame, and our
    // own receipt frames anywhere — so there is nobody to ask and no reason to
    // wait. the grace spent here is the donor watching "Processing...".
    const f = fake_win(true);

    redirect_after_donation({ dest: ours, form_id: "form_1", win: f.win });

    expect(f.win.location.href).toBe(ours.url);
    expect(f.posted).toHaveLength(0);
  });

  test("a script embed asks the host page first, then takes itself there", () => {
    const f = fake_win(true);

    redirect_after_donation({
      dest: ours,
      form_id: "form_1",
      parent_origin: "https://npo.org",
      win: f.win,
    });

    // the message `form-embed.js` listens for, unchanged
    expect(f.posted).toEqual([
      { type: "redirect", redirect_url: ours.url, form_id: "form_1" },
    ]);
    // a script-mode host is navigating the top page right now — don't race it
    expect(f.win.location.href).toBe("about:blank");

    // a host whose script is stale enough not to answer still gets the donor
    // to the receipt, one frame down
    vi.advanceTimersByTime(PARENT_GRACE_MS);
    expect(f.win.location.href).toBe(ours.url);
  });

  test("a host page that acknowledges is not navigated over", () => {
    const f = fake_win(true);
    const on_stuck = vi.fn();

    redirect_after_donation({
      dest: ours,
      form_id: "form_1",
      parent_origin: "https://npo.org",
      on_stuck,
      win: f.win,
    });
    // the host is taking the top page there itself — loading it in here too
    // would fire the merchant's conversion pixel twice
    f.ack("form_1");

    vi.advanceTimersByTime(PARENT_GRACE_MS * 4);
    expect(f.win.location.href).toBe("about:blank");

    // but an ack is a promise, not proof: a host that says so and never
    // arrives still owes the donor an answer
    vi.advanceTimersByTime(NAV_GRACE_MS);
    expect(on_stuck).toHaveBeenCalledOnce();
  });

  test("an ack meant for a different form on the page is ignored", () => {
    const f = fake_win(true);

    redirect_after_donation({
      dest: ours,
      form_id: "form_1",
      parent_origin: "https://npo.org",
      win: f.win,
    });
    f.ack("form_2");

    vi.advanceTimersByTime(PARENT_GRACE_MS);
    expect(f.win.location.href).toBe(ours.url);
  });

  test("a page frozen mid-wait resumes with its fallback intact", () => {
    // the defect this guards against: a wallet sheet taking over the tab on mobile
    // fires `pagehide`, which cancelled the fallback permanently — the donor
    // came back to a form that would never move again.
    const f = fake_win(true);

    redirect_after_donation({
      dest: ours,
      form_id: "form_1",
      parent_origin: "https://npo.org",
      win: f.win,
    });
    f.freeze();

    // frozen: the browser suspends timers, and so do we
    vi.advanceTimersByTime(PARENT_GRACE_MS * 4);
    expect(f.win.location.href).toBe("about:blank");

    f.resume();
    vi.advanceTimersByTime(PARENT_GRACE_MS);
    expect(f.win.location.href).toBe(ours.url);
  });

  test("a document that really is unloading stops there", () => {
    const f = fake_win(false);
    const on_stuck = vi.fn();

    redirect_after_donation({ dest: ours, on_stuck, win: f.win });
    expect(f.win.location.href).toBe(ours.url);
    // the next document arrived
    f.unload();

    vi.advanceTimersByTime(NAV_GRACE_MS * 2);
    expect(on_stuck).not.toHaveBeenCalled();
  });

  test("a navigation that never commits ends in an answer, not a spinner", () => {
    const f = fake_win(false);
    const on_stuck = vi.fn();

    redirect_after_donation({ dest: ours, on_stuck, win: f.win });

    // assigning `location.href` unloads nothing until the next document
    // arrives, so a slow thank-you page must not read as a failure
    vi.advanceTimersByTime(NAV_GRACE_MS - 1);
    expect(on_stuck).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(on_stuck).toHaveBeenCalledOnce();
  });

  test("a merchant's own page is never loaded into the frame", () => {
    // it may answer X-Frame-Options: DENY, and committing that error document
    // would take the donor's last message down with it
    const f = fake_win(true);
    const on_stuck = vi.fn();

    redirect_after_donation({
      dest: theirs,
      form_id: "form_1",
      on_stuck,
      win: f.win,
    });

    vi.advanceTimersByTime(PARENT_GRACE_MS);
    expect(f.win.location.href).toBe("about:blank");
    expect(on_stuck).toHaveBeenCalledOnce();
  });

  test("the message is aimed at the host origin its script told us", () => {
    // a custom success_redirect puts the donor's name and what they gave in
    // this url. broadcast, any page that can frame us reads it.
    const f = fake_win(true);

    redirect_after_donation({
      dest: theirs,
      form_id: "form_1",
      parent_origin: "https://npo.org",
      win: f.win,
    });

    expect(f.targets).toEqual(["https://npo.org"]);
  });

  test("an embed that never told us still works, on the old wildcard", () => {
    // merchant pages run a cached `form-embed.js` we don't control, and an
    // older copy sends no origin. it has to keep working exactly as it did.
    const f = fake_win(true);

    redirect_after_donation({ dest: theirs, form_id: "form_1", win: f.win });

    expect(f.targets).toEqual(["*"]);
  });

  test("something that isn't an origin is never used as one", () => {
    // postMessage throws on a malformed target, and that throw would land in
    // the middle of a donation that already went through
    for (const bad of ["https://npo.org/thanks", "npo.org", "", "*"]) {
      const f = fake_win(true);
      // a merchant destination, because that is the message worth aiming: it
      // carries the donor's name and what they gave
      redirect_after_donation({
        dest: theirs,
        form_id: "form_1",
        parent_origin: bad,
        win: f.win,
      });
      expect(f.targets).toEqual(["*"]);
    }
  });

  test("cancelling stops every pending fallback", () => {
    const f = fake_win(true);
    const on_stuck = vi.fn();

    const cancel = redirect_after_donation({
      dest: ours,
      form_id: "form_1",
      parent_origin: "https://npo.org",
      on_stuck,
      win: f.win,
    });
    cancel();

    vi.advanceTimersByTime(PARENT_GRACE_MS + NAV_GRACE_MS);
    expect(f.win.location.href).toBe("about:blank");
    expect(on_stuck).not.toHaveBeenCalled();
  });
});
