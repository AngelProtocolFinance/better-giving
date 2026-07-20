// splat route for unmatched urls. the loader always throws a 404 so the status
// code is correct and the thrown response bubbles to the root ErrorBoundary,
// which owns the "page not found" ui. the default export below is required by
// the route-module contract but is never reached (the loader throws first).
export function loader() {
  throw new Response("Not Found", { status: 404 });
}

export default function NotFound() {
  return null;
}
