/// <reference types="vite/client" />
import { reactRouter } from "@react-router/dev/vite";
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "build" },
  // resolve the `#/` -> src/* tsconfig path alias (used across src). matches
  // platform's setup; required for the dev ssr module runner to find them.
  resolve: { tsconfigPaths: true },
  plugins: [reactRouter(), tailwind()],
});
