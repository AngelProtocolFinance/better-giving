/// <reference types="vitest/config" />
import { reactRouter } from "@react-router/dev/vite";
import { sentryReactRouter } from "@sentry/react-router";
import tailwind from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";
import { devtools_json } from "./plugins/devtools-json";
import { inline_binary } from "./plugins/inline-binary";
import { check_env } from "./utils/check-env";

export default defineConfig((config) => {
  const env = check_env(config.mode);
  const is_test = !!env.VITEST;
  // vite base for content-hashed client assets: "/" locally, blob origin on
  // deployed stages (skew protection). MUST end in "/" — vite concatenates
  // `base + filename` for ssr-manifest module urls.
  const asset_base = env.ASSET_BASE_URL;
  const rr7 = !is_test && reactRouter();
  // vercel sets VERCEL_GIT_COMMIT_SHA on deploys; not part of the check_env list
  // since sentry uploads only run on vercel (where SENTRY_AUTH_TOKEN is set).
  const sentry =
    !is_test &&
    !!env.SENTRY_AUTH_TOKEN &&
    !!env.VERCEL_GIT_COMMIT_SHA &&
    sentryReactRouter(
      {
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        release: { name: env.VERCEL_GIT_COMMIT_SHA },
      },
      config
    );
  const plugins = [devtools_json(), inline_binary(), rr7, tailwind(), sentry];
  return {
    base: asset_base,
    build: { outDir: "build", target: "es2022", sourcemap: "hidden" },
    // `emails` exports raw .tsx (no build step); bundle it into the ssr build so
    // node never tries to import untranspiled tsx at runtime (api/auth email paths).
    ssr: { noExternal: ["emails"] },
    server: { port: 4200, strictPort: true, allowedHosts: [".ngrok-free.app"] },
    resolve: { tsconfigPaths: true },
    plugins,
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
      env,
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
