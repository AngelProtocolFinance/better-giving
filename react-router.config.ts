import type { Config } from "@react-router/dev/config";
import { sentryOnBuildEnd } from "@sentry/react-router";
import { vercelPreset } from "@vercel/react-router/vite";
export default {
  ssr: true,
  appDirectory: "src",
  future: { v8_middleware: true },
  presets: [vercelPreset()],
  buildEnd: async (args) => {
    if (process.env.SENTRY_AUTH_TOKEN) {
      await sentryOnBuildEnd(args);
    }
    // when serving assets from blob (ASSET_BASE_URL set in vite.config.ts),
    // mirror the content-hashed client assets there so cached html never 404s
    // on a rotated-out deployment's assets. fails the build on error so a
    // deploy never ships html pointing at un-uploaded assets.
    if (process.env.ASSET_BASE_URL) {
      const { upload_client_assets } = await import(
        "./plugins/upload-client-assets"
      );
      await upload_client_assets();
    }
  },
} satisfies Config;
