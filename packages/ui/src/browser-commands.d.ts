export {};

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia(options: {
      reducedMotion: "reduce" | "no-preference" | null;
    }): Promise<void>;
  }
}
