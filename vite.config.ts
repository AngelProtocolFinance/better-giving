/// <reference types="vitest/config" />
import { reactRouter } from "@react-router/dev/vite";
import { sentryReactRouter } from "@sentry/react-router";
import tailwind from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, loadEnv } from "vite";
import { check_env } from "./plugins/check-env";
import { devtools_json } from "./plugins/devtools-json";
import { inline_binary } from "./plugins/inline-binary";

export default defineConfig((config) => {
  const is_test = !!process.env.VITEST;
  const rr7 = !is_test && reactRouter();
  const sentry =
    !is_test &&
    !!process.env.SENTRY_AUTH_TOKEN &&
    sentryReactRouter(
      {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // vercel sets VERCEL_GIT_COMMIT_SHA on deploys; not part of the
        // check_env list since sentry uploads only run when SENTRY_AUTH_TOKEN
        // is set (Vercel envs only).
        release: { name: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
      },
      config
    );
  return {
    build: { outDir: "build", target: "es2022", sourcemap: "hidden" },
    server: { port: 4200, allowedHosts: [".ngrok-free.app"] },
    resolve: { tsconfigPaths: true },
    plugins: [
      check_env(),
      devtools_json(),
      inline_binary(),
      rr7,
      tailwind(),
      sentry,
    ],
    test: {
      setupFiles: [
        "./src/setup-tests-browser.ts",
        "./src/__tests__/mocks/payment.tsx",
      ],
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        screenshotFailures: false,
        instances: [{ browser: "chromium" }],
      },
      env: loadEnv(config.mode, process.cwd(), ""),
      globals: true,
      exclude: ["**/node_modules/**", ".claude/**", "jobs/**"],
      testTimeout: 15_000,
      fileParallelism: false,
      coverage: {
        provider: "v8",
        reporter: ["text"],
        // .tsx only — testing-library tests target rendered UI, not pure logic
        include: ["src/**/*.tsx", "lib/**/*.tsx"],
        exclude: [
          // test infra
          "src/**/*.test.{ts,tsx}",
          "src/__tests__/**",
          "src/setup-tests-browser.ts",

          // landing pages
          "src/routes/_landing/**",
          "src/routes/_landing.*/**",

          // homepage
          "src/routes/_index/**",

          // marketing / informational
          "src/routes/_app.about-us/**",
          "src/routes/_app.nonprofit/**",
          "src/routes/_app.donor/**",
          "src/routes/_app.blog/**",
          "src/routes/_app.blog_.$slug/**",
          "src/routes/_app.donation-calculator/**",
          "src/routes/_app.resources/**",
          "src/routes/_app.wp-plugin/**",
          "src/routes/_app.zapier-integration/**",
          "src/routes/referral-program/**",
          "src/routes/see-what-youre-losing/**",
          "src/routes/simplify-fundraising-maximize-impact/**",
          "src/routes/simplify-fundraising-maximize-impacts/**",
          "src/routes/the-smart-move-to-make-for-accepting-crypto-donations/**",
          "src/routes/unlock-us-donations/**",
          "src/routes/nonprofits.$slug/**",

          // legal / policy
          "src/routes/_app.privacy-policy/**",
          "src/routes/_app.security-policy/**",
          "src/routes/_app.terms-of-use/**",
          "src/routes/_app.terms-of-use-npo/**",
          "src/routes/_app.terms-of-use-referrals/**",
          "src/routes/_app.terms-of-use-sms/**",

          // static display components (no logic)
          "src/components/footer/**",
          "src/components/header/**",
          "src/components/video/**",
          "src/components/referrals/**",

          // scripts — one-off migrations/utilities
          "src/scripts/**",

          // types & constants — no logic
          "src/types/**",
          "src/constants/**",
          "lib/types/**",
          "lib/constants/**",

          // content & assets
          "src/content/**",
          "src/assets/**",

          // root entry/config files
          "src/root.tsx",
          "src/root-layout.tsx",
          "src/root-loader.ts",
          "src/root-action.ts",
          "src/routes.ts",

          // layout wrappers
          "src/layout/**",
        ],
      },
    },
  };
});
