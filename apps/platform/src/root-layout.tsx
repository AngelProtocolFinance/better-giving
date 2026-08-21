import { Toaster } from "@better-giving/ui";
import type { PropsWithChildren } from "react";
import { preconnect } from "react-dom";
import { Links, Meta, Scripts, ScrollRestoration } from "react-router";
import { NavProgress } from "#/components/nav-progress";
import { useConsent } from "./use-consent";

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
        {/* blocking, pre-paint: mirrors the dismissed banner from localStorage
            onto <html> so the css variant in announcement-banner.tsx empties
            the bar before first paint. must stay synchronous and inline —
            deferring it (or moving it to a mount effect) shifts the layout of
            every marketing page for anyone who already dismissed.

            sits above <Meta />/<Links /> on purpose: a classic inline script
            can't run until every stylesheet declared before it has loaded, and
            parsing blocks behind it — which would serialize work on every
            document in the app, dashboard and admin routes included.

            the key is duplicated from announcement-banner.tsx's `KEY` because
            it has to be a static string here; the drift test in
            announcement-banner.test.tsx reads this file and fails if they
            diverge. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static literal, no interpolation
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("banner:ncnp-endorsement")==="1")document.documentElement.dataset.bannerDismissed="ncnp-endorsement"}catch(e){}`,
          }}
        />
        <link rel="icon" href="/favicon.ico" />
        <Meta />
        <Links />
        <style />
      </head>
      <body className="">
        <NavProgress />
        <Toaster>{children}</Toaster>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
