/// <reference types="vitest/config" />
import tailwind from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";

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
      // see apps/platform/vite.config.ts for why: vitest's browser api server
      // defaults to a fixed port with strictPort effectively on, so this
      // collides with platform's own browser-mode suite when both run
      // concurrently under turbo.
      api: { strictPort: false },
    },
    globals: true,
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
