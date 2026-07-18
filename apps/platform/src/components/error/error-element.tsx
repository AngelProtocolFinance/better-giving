import {
  href,
  isRouteErrorResponse,
  NavLink,
  useMatches,
  useRevalidator,
  useRouteError,
} from "react-router";
import laira_pointing from "#/assets/laira/laira-pointing.webp";
import laira_sitting from "#/assets/laira/laira-sitting.webp";
import laira_standing from "#/assets/laira/laira-standing-front.webp";
import laira_yellow from "#/assets/laira/laira-yellow.webp";
import { GENERIC_ERROR_MESSAGE } from "@/constants/common";

interface IStatusConfig {
  mascot: string;
  title: string;
  description: string;
  action: "back" | "retry";
}

const STATUS_CONFIG: Record<number, IStatusConfig> = {
  403: {
    mascot: laira_standing,
    title: "Access denied",
    description: "You don't have permission to access this resource.",
    action: "back",
  },
  404: {
    mascot: laira_pointing,
    title: "Page not found",
    description: "We couldn't find what you're looking for.",
    action: "back",
  },
  500: {
    mascot: laira_sitting,
    title: "Something went wrong",
    description: "Something went wrong on our end. Please try again.",
    action: "retry",
  },
};

function use_back_path(): string {
  const matches = useMatches();
  const pathname = matches.at(-1)?.pathname ?? "";

  if (pathname.startsWith("/admin/")) {
    // extract /admin/:id
    const segments = pathname.split("/");
    return segments.length >= 3
      ? `/admin/${segments[2]}`
      : href("/marketplace");
  }
  if (pathname.startsWith("/dashboard")) return href("/dashboard");
  if (pathname.startsWith("/platform")) return href("/platform");
  return href("/marketplace");
}

export function ErrorElement() {
  // route errors already reported by entry.server handleError on the way down;
  // this only renders the fallback UI.
  const error = useRouteError();
  const revalidator = useRevalidator();
  const back_path = use_back_path();

  if (isRouteErrorResponse(error)) {
    const config = STATUS_CONFIG[error.status];
    if (config) {
      return (
        <div className="grid place-items-center content-center px-5 py-14 min-h-[60vh]">
          <img src={config.mascot} alt="" width={120} height={120} />
          <p className="font-gochi text-6xl text-primary mt-4">
            {error.status}
          </p>
          <h1 className="text-xl font-bold text-center mt-2">{config.title}</h1>
          <p className="text-muted-fg text-center text-balance max-w-md mt-2">
            {config.description}
          </p>
          <div className="flex gap-3 mt-8">
            {config.action === "back" ? (
              <NavLink
                to={back_path}
                className="btn btn-primary text-sm px-8 py-2 rounded"
              >
                Go back
              </NavLink>
            ) : (
              <button
                type="button"
                onClick={() => revalidator.revalidate()}
                className="btn btn-primary text-sm px-8 py-2 rounded"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      );
    }
  }

  // unknown / unexpected errors
  return (
    <div className="grid place-items-center content-center px-5 py-14 min-h-[60vh]">
      <img src={laira_yellow} alt="" width={120} height={120} />
      <h1 className="text-xl font-bold text-center mt-6">
        Oops, something went wrong
      </h1>
      <p className="text-muted-fg text-center text-balance max-w-md mt-2">
        {GENERIC_ERROR_MESSAGE}
      </p>
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="bg-muted p-4 rounded text-xs text-muted-fg mt-4 max-w-2xl overflow-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
          {error.message}
          {"\n"}
          {error.stack}
        </pre>
      )}
      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-primary text-sm px-8 py-2 rounded"
        >
          Reload
        </button>
        <NavLink
          to={back_path}
          className="btn btn-secondary text-sm px-8 py-2 rounded"
        >
          Go back
        </NavLink>
      </div>
    </div>
  );
}
