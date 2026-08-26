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
  // vitest sets VITEST in the process before this config is loaded.
  const is_test = !!process.env.VITEST;
  // `react-router typegen` loads this config too, and its ConfigEnv is
  // byte-identical to `react-router build`'s (command "build", mode
  // "production") — argv is the only thing that tells them apart. it can't be
  // spoofed by a deploy env the way an opt-out flag could.
  const is_typegen = process.argv.includes("typegen");
  // neither run needs real credentials, so the guard stands down for both.
  // typegen is the one that would otherwise break a clean checkout: it loads
  // this config at mode "production", and .env.production is gitignored, so ci
  // has no values for a run that only reads the route graph. vitest does find
  // values (.env.test is committed filler) — standing down just keeps the suite
  // from depending on the guard. dev and build still hard-fail on a missing
  // key, which is the guard's whole point.
  const env = check_env(config.mode, !is_test && !is_typegen);
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
      // two projects. `browser` runs every component and route test in
      // headless chromium. `node` exists for the one thing browser mode cannot
      // do: read the source tree off disk (`node:fs`), which is what the names
      // sweeps need.
      projects: [
        {
          // inherit this file's vite config (plugins, resolve, base).
          extends: true,
          test: {
            name: "browser",
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
              // vitest's browser api server defaults to a fixed port (63315) with
              // strictPort effectively on, so two browser-mode vitest processes
              // (this one + packages/ui, running concurrently under turbo) crash
              // one of them with "Port 63315 is already in use" instead of falling
              // back — reported upstream as a silent "no tests" run, not a visible
              // crash. explicit strictPort:false restores vite's normal
              // try-next-port behavior. every browser-mode package needs this.
              api: { strictPort: false },
            },
            env,
            globals: true,
            // *.node.test.ts is the node project's; without this exclude it
            // would also match the browser project's default include glob and
            // run twice — once in a browser that has no `node:fs`.
            exclude: [
              "**/node_modules/**",
              ".claude/**",
              "jobs/**",
              "**/*.node.test.ts",
            ],
            testTimeout: 15_000,
            fileParallelism: false,
          },
        },
        {
          extends: true,
          test: {
            name: "node",
            environment: "node",
            // jobs/ is server-side and excluded from the browser project, so
            // this is the only project that can carry a test for it.
            include: ["src/**/*.node.test.ts", "jobs/**/*.node.test.ts"],
            globals: true,
          },
        },
      ],
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
          // about-us is excluded file-by-file: donate.tsx carries a live
          // donation mount and route.tsx a loader (base_url from the request
          // origin) — both are covered; the rest is static copy
          "src/routes/_app.about-us/manifesto.tsx",
          "src/routes/_app.about-us/values.tsx",
          "src/routes/_app.about-us/volunteer.tsx",
          "src/routes/_app.about-us/underdog-letter.tsx",
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
          // footer is excluded file-by-file: footer.tsx branches on variant and
          // is covered; the rest is markup
          "src/components/footer/index.ts",
          "src/components/footer/newsletter-form.tsx",
          "src/components/footer/socials.tsx",
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
