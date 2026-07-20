import { socials } from "@better-giving/brand";
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
    <header className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
      <Link to="/" className="inline-flex items-center gap-3">
        <img src={logo} alt="Better Giving" width={150} height={40} />
      </Link>
      <span className="text-sm font-medium text-neutral-500">Developer</span>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 px-6 py-8 mt-auto">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
        <div className="flex items-center gap-4">
          <a
            href={socials.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-110 transition-transform"
          >
            <img src={linkedin} alt="LinkedIn" width={20} height={20} />
          </a>
          <a
            href={socials.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-110 transition-transform"
          >
            <img src={facebook} alt="Facebook" width={18} height={18} />
          </a>
          <a
            href={socials.x}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-110 transition-transform"
          >
            <img src={x} alt="X" width={15} height={15} />
          </a>
          <a
            href={socials.youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-110 transition-transform"
          >
            <img src={youtube} alt="YouTube" width={21} height={21} />
          </a>
          <a
            href={socials.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-110 transition-transform"
          >
            <img src={instagram} alt="Instagram" width={18} height={18} />
          </a>
        </div>
        <p className="text-sm text-neutral-500 text-center">
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
          <h2 className="text-xl font-semibold text-neutral-900">
            Page not found
          </h2>
          <p className="text-sm text-neutral-500">
            The page you're looking for doesn't exist.
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
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
        <h2 className="text-xl font-semibold text-neutral-900">
          Something went wrong
        </h2>
        <p className="text-sm text-neutral-500">
          An error occurred while loading this page.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
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
