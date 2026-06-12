import type { Route } from "./+types/route";

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { default } from "./filter";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});
