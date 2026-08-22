import { socials } from "@better-giving/brand";
import { ExtLink } from "@better-giving/ui";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { APP_NAME } from "#/constants";
import type { Route } from "./+types/root";
import facebook from "./assets/icons/social/facebook.webp";
import instagram from "./assets/icons/social/instagram.webp";
import linkedin from "./assets/icons/social/linkedin.webp";
import x from "./assets/icons/social/x.webp";
import youtube from "./assets/icons/social/youtube.webp";
import logo from "./assets/images/bg-logo-503c.webp";
import tailwind from "./index.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "stylesheet", href: tailwind },
];

export const meta: Route.MetaFunction = () => [
  { title: `${APP_NAME} Developer Resources` },
  {
    name: "description",
    content: `Explore form embedding examples, API documentation, and integration guides to seamlessly incorporate Better Giving's donation solutions into your website.`,
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased min-h-screen flex flex-col">
        <Header />
        {children}
        <Footer />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="border-b">
      <div className="page py-4 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3">
          <img src={logo} alt="Better Giving" width={150} height={40} />
        </Link>
        <span className="text-sm font-medium text-muted-fg">Developer</span>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-muted mt-auto">
      <div className="page py-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-4">
          <ExtLink
            href={socials.linkedin}
            className="hover:scale-110 transition-transform"
          >
            <img src={linkedin} alt="LinkedIn" width={20} height={20} />
          </ExtLink>
          <ExtLink
            href={socials.facebook}
            className="hover:scale-110 transition-transform"
          >
            <img src={facebook} alt="Facebook" width={18} height={18} />
          </ExtLink>
          <ExtLink
            href={socials.x}
            className="hover:scale-110 transition-transform"
          >
            <img src={x} alt="X" width={15} height={15} />
          </ExtLink>
          <ExtLink
            href={socials.youtube}
            className="hover:scale-110 transition-transform"
          >
            <img src={youtube} alt="YouTube" width={21} height={21} />
          </ExtLink>
          <ExtLink
            href={socials.instagram}
            className="hover:scale-110 transition-transform"
          >
            <img src={instagram} alt="Instagram" width={18} height={18} />
          </ExtLink>
        </div>
        <p className="text-sm text-muted-fg text-center">
          © Copyright {new Date().getFullYear()} Better Giving, a registered
          charitable 501(c)(3) (EIN 87-3758939)
        </p>
      </div>
    </footer>
  );
}

// ported from bg-docs error.tsx. `reset` (next) has no rr7 equivalent; a
// reload re-runs the failed render, matching the "try again" intent. also owns
// the 404 ui for the splat route (routes/not-found.tsx), whose loader throws a
// 404 response that bubbles here.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-fg">Page not found</h2>
          <p className="text-sm text-muted-fg">
            The page you're looking for doesn't exist.
          </p>
          <Link to="/" className="btn btn-primary inline-flex">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  if (import.meta.env.DEV) console.error(error);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-fg">Something went wrong</h2>
        <p className="text-sm text-muted-fg">
          An error occurred while loading this page.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default function Root() {
  return <Outlet />;
}
