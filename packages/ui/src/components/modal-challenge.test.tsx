import { useState } from "react";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Modal } from "./modal";

// below `sm` the donate dialog is a full-viewport sheet, so a corner click is
// inside it and the overlay's width cannot be told from the dialog's.
let restore_viewport: { width: number; height: number } | null = null;
beforeAll(async () => {
  restore_viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  await page.viewport(1280, 720);
});
afterAll(async () => {
  if (restore_viewport) {
    await page.viewport(restore_viewport.width, restore_viewport.height);
  }
});

const next_frame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

// zag attaches outside-pointer listeners a frame after open, and `data-inert`
// lands on <body> in a microtask. a press before then hits no listener.
const layer_ready = async () => {
  await expect.poll(() => document.body.hasAttribute("data-inert")).toBe(true);
  await next_frame();
};

// the open dialog sets `pointer-events: none` on <body>, which the portalled
// backdrop inherits, so the click lands on the root, at a corner the content
// box never reaches. same call as modal.test.tsx — `HTMLElement.click()` does
// not hit-test and is not proof the frame can be clicked.
const click_corner = () =>
  page
    .elementLocator(document.documentElement)
    .click({ position: { x: 4, y: 4 } });

function stripe_challenge() {
  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483647";
  const frame = document.createElement("iframe");
  frame.name = "__privateStripeFrame";
  frame.src = "https://js.stripe.com/v3/three-ds-2-challenge.html";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Complete authentication";
  root.append(frame, button);
  return { root, frame, button };
}

function OpenDonate({
  adopt,
  on_close,
}: {
  adopt: boolean;
  on_close: () => void;
}) {
  return (
    <Modal
      open
      onClose={on_close}
      adoptStripeChallenge={adopt}
      size="donate"
      title="Donate"
    >
      <p>Card</p>
    </Modal>
  );
}

test("opt-in on, a body challenge keeps the viewport, focus, and dismiss", async () => {
  const on_close = vi.fn();
  await render(<OpenDonate adopt on_close={on_close} />);
  const dialog = page.getByRole("dialog", { name: "Donate" });
  await expect.element(dialog).toBeVisible();
  await layer_ready();

  const { root, frame, button } = stripe_challenge();
  onTestFinished(() => root.remove());
  document.body.appendChild(root);

  await expect.poll(() => getComputedStyle(button).pointerEvents).toBe("auto");
  // dismiss flags commit on the render after the observer. a frame is after that.
  await next_frame();
  expect(root.parentElement).toBe(document.body);
  expect(root.closest("[role=dialog]")).toBeNull();
  const width = root.getBoundingClientRect().width;
  expect(Math.abs(width - window.innerWidth)).toBeLessThan(8);
  expect(width).toBeGreaterThan(480);

  await userEvent.keyboard("{Escape}");
  expect(on_close).not.toHaveBeenCalled();

  await click_corner();
  expect(on_close).not.toHaveBeenCalled();

  frame.focus();
  await next_frame();
  expect(document.activeElement).toBe(frame);

  document.body.removeChild(root);
  expect(root.isConnected).toBe(false);
  await vi.waitFor(async () => {
    on_close.mockClear();
    await click_corner();
    expect(on_close).toHaveBeenCalled();
  });
});

test("opt-in on, stripe wiping pointer-events does not drop the frame", async () => {
  await render(<OpenDonate adopt on_close={() => {}} />);
  await expect
    .element(page.getByRole("dialog", { name: "Donate" }))
    .toBeVisible();
  await layer_ready();

  const { root } = stripe_challenge();
  onTestFinished(() => root.remove());
  document.body.appendChild(root);
  await next_frame();
  await next_frame();
  expect(root.style.pointerEvents).toBe("auto");

  root.style.pointerEvents = "";
  await next_frame();
  expect(root.style.pointerEvents).toBe("auto");
});

test("opt-in on, tab from the dialog reaches the challenge frame", async () => {
  const on_close = vi.fn();
  await render(
    <Modal
      open
      onClose={on_close}
      adoptStripeChallenge
      size="donate"
      title="Donate"
    >
      <button type="button">Pay</button>
    </Modal>
  );
  await expect
    .element(page.getByRole("dialog", { name: "Donate" }))
    .toBeVisible();
  await layer_ready();

  const { root, frame } = stripe_challenge();
  onTestFinished(() => root.remove());
  document.body.appendChild(root);
  await next_frame();
  await next_frame();

  page.getByRole("button", { name: "Pay" }).element().focus();
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement).toBe(frame);
  expect(on_close).not.toHaveBeenCalled();
});

test("opt-in on, a stripe controller iframe does not block dismiss", async () => {
  const on_close = vi.fn();
  await render(<OpenDonate adopt on_close={on_close} />);
  await expect
    .element(page.getByRole("dialog", { name: "Donate" }))
    .toBeVisible();
  await layer_ready();

  const frame = document.createElement("iframe");
  frame.name = "__privateStripeFrame";
  frame.src = "https://js.stripe.com/v3/m-outer.html";
  onTestFinished(() => frame.remove());
  document.body.appendChild(frame);
  await next_frame();
  await next_frame();

  expect(frame.parentElement).toBe(document.body);
  expect(frame.style.pointerEvents).toBe("");
  expect(getComputedStyle(frame).pointerEvents).toBe("none");

  await vi.waitFor(async () => {
    on_close.mockClear();
    await click_corner();
    expect(on_close).toHaveBeenCalled();
  });
});

test("opt-in off, the focus trap pulls focus back from a body challenge", async () => {
  await render(<OpenDonate adopt={false} on_close={() => {}} />);
  const dialog = page.getByRole("dialog", { name: "Donate" });
  await expect.element(dialog).toBeVisible();
  await layer_ready();

  const { root, frame } = stripe_challenge();
  onTestFinished(() => root.remove());
  document.body.appendChild(root);
  await next_frame();

  expect(root.parentElement).toBe(document.body);
  expect(root.closest("[role=dialog]")).toBeNull();

  frame.focus();
  await next_frame();
  expect(document.activeElement).not.toBe(frame);
});

test("opt-in on, a plain div on body does not block dismiss", async () => {
  const on_close = vi.fn();
  await render(<OpenDonate adopt on_close={on_close} />);
  const dialog = page.getByRole("dialog", { name: "Donate" });
  await expect.element(dialog).toBeVisible();
  await layer_ready();

  const plain = document.createElement("div");
  plain.textContent = "Saved";
  onTestFinished(() => plain.remove());
  document.body.appendChild(plain);
  await next_frame();
  await next_frame();

  expect(plain.parentElement).toBe(document.body);
  expect(dialog.element().contains(plain)).toBe(false);

  await vi.waitFor(async () => {
    on_close.mockClear();
    await click_corner();
    expect(on_close).toHaveBeenCalled();
  });
});

test("dialog closed, appending a stripe challenge does not throw", async () => {
  let close = () => {};
  function Harness() {
    const [open, set_open] = useState(true);
    close = () => set_open(false);
    return (
      <Modal
        open={open}
        onClose={() => set_open(false)}
        adoptStripeChallenge
        size="donate"
        title="Donate"
      >
        <p>Card</p>
      </Modal>
    );
  }
  await render(<Harness />);
  const dialog = page.getByRole("dialog", { name: "Donate" });
  await expect.element(dialog).toBeVisible();
  await layer_ready();
  close();
  await expect.element(dialog).not.toBeInTheDocument();

  const { root } = stripe_challenge();
  onTestFinished(() => root.remove());
  expect(() => document.body.appendChild(root)).not.toThrow();
  await next_frame();
  await next_frame();

  expect(root.parentElement).toBe(document.body);
  expect(root.style.pointerEvents).toBe("");
  expect(document.querySelector("[role=dialog]")).toBeNull();
});

test("opt-in on, stripe hiding other body children leaves the challenge outside aria-hidden", async () => {
  await render(<OpenDonate adopt on_close={() => {}} />);
  const dialog = page.getByRole("dialog", { name: "Donate" });
  await expect.element(dialog).toBeVisible();
  await layer_ready();

  const { root } = stripe_challenge();
  onTestFinished(() => root.remove());
  document.body.appendChild(root);
  await next_frame();
  expect(root.parentElement).toBe(document.body);

  // stripe's show() marks every other body child after the frame loads. the
  // frame is still a body child, so that mark must not cover it, and the
  // dialog portal keeps the mark — stripping it would uncover the page.
  const marked: Element[] = [];
  for (const child of document.body.children) {
    if (child === root || child.hasAttribute("aria-hidden")) continue;
    child.setAttribute("aria-hidden", "true");
    marked.push(child);
  }
  onTestFinished(() => {
    for (const child of marked) child.removeAttribute("aria-hidden");
  });

  expect(root.closest("[aria-hidden='true']")).toBeNull();
  // role lookup skips aria-hidden, which is the mark under test
  const content = document.querySelector("[role=dialog]");
  expect(content?.closest("[aria-hidden='true']")).not.toBeNull();
});
