import { expect } from "vitest";

const next_frame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * zag attaches an open dialog's Escape and outside-pointer listeners a frame
 * after it opens; `data-inert` lands on <body> right after the first. a press
 * before then hits no listener, so "the dialog stayed open" proves nothing.
 * same wait as `layer_ready` in packages/ui's modal.test.tsx.
 */
export async function layer_ready() {
  await expect.poll(() => document.body.hasAttribute("data-inert")).toBe(true);
  await next_frame();
}

/** frames for a handler that would have closed the dialog to have run */
export async function settle_frames(n = 3) {
  for (let i = 0; i < n; i++) await next_frame();
}
