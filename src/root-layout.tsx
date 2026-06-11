import { lazy, type PropsWithChildren, Suspense } from "react";
import { preconnect } from "react-dom";
import { Links, Meta, Scripts, ScrollRestoration } from "react-router";
import { NavProgress } from "#/components/nav-progress";
import { Toaster } from "#/components/toaster";
import { useConsent } from "./use-consent";

const TooltipProvider = lazy(() =>
  import("@base-ui/react/tooltip").then((m) => ({
    default: ({ children }: PropsWithChildren) => (
      <m.Tooltip.Provider delay={50}>{children}</m.Tooltip.Provider>
    ),
  }))
);

export function Layout({ children }: PropsWithChildren<{ classes?: string }>) {
  // resource hints — emitted in <head> during SSR
  preconnect("https://angelgiving.10web.site");
  preconnect("https://cnfc6hjkztdschkg.public.blob.vercel-storage.com");

  useConsent();

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
        <Meta />
        <Links />
        <style />
      </head>
      <body className="">
        <NavProgress />
        <Suspense>
          <TooltipProvider>
            <Toaster>{children}</Toaster>
          </TooltipProvider>
        </Suspense>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
