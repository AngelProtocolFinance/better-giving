import { page } from "vitest/browser";

/** vitest's browser default (`browser.viewport` is unset in vite.config.ts).
 * a file that sets a width hands it to the next file, so each puts it back
 * to this one rather than to a size nothing configures */
export const RUNNER_VIEWPORT = { width: 414, height: 896 };

export const reset_viewport = () =>
  page.viewport(RUNNER_VIEWPORT.width, RUNNER_VIEWPORT.height);
