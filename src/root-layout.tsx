import type { PropsWithChildren } from "react";
import { preconnect } from "react-dom";
import { Links, Meta, Scripts, ScrollRestoration } from "react-router";
import { NavProgress } from "#/components/nav-progress";
import { Toaster } from "#/components/toaster";
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
