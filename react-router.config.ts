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
  },
} satisfies Config;
