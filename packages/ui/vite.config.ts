/// <reference types="vitest/config" />
import tailwind from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";
import type { BrowserCommand } from "vitest/node";

// the tester runs inside the browser, where nothing can reach the playwright
// session driving it — emulating a media preference has to happen server-side,
// and a command is the only door back out. typed in
// src/browser-commands.d.ts.
const emulateMedia: BrowserCommand<
  [{ reducedMotion: "reduce" | "no-preference" | null }]
> = async (ctx, options) => {
  if (ctx.provider.name !== "playwright")
    throw new Error(`emulateMedia needs playwright, got ${ctx.provider.name}`);
  await ctx.page.emulateMedia(options);
};

// the package runs its own browser-mode suite rather than borrowing platform's:
// nothing here touches msw, the api mocks, or `process.env`, so platform's two
// setup files (which import `#/services/*`) would be dead weight and would tie
// the design system's tests to the app's aliases.
export default defineConfig({
  plugins: [tailwind()],
  test: {
    setupFiles: ["./src/test-setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
      commands: { emulateMedia },
      // v5 default is exact string matching; kept on v4 substring matching
      // to match platform's suite.
      locators: { exact: false },
    },
    // see apps/platform/vite.config.ts for why: vitest's browser api server
    // defaults to a fixed port with strictPort effectively on, so this
    // collides with platform's own browser-mode suite when both run
    // concurrently under turbo.
    api: { strictPort: false },
    globals: true,
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
