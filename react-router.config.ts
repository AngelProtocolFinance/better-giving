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
    // when assets are served from blob (vite base is a real origin, not "/";
    // see vite.config.ts), mirror the content-hashed client assets there so
    // cached html never 404s on a rotated-out deployment's assets. throws on
    // error so a deploy never ships html pointing at un-uploaded assets.
    const base = args.viteConfig.base;
    if (base !== "/") {
      const { upload_client_assets } = await import(
        "./utils/upload-client-assets"
      );
      await upload_client_assets(base);
    }
  },
} satisfies Config;
