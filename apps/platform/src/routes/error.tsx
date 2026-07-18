import type { LoaderFunction } from "react-router";

export const loader: LoaderFunction = async () => {
  console.error("ERROR: test error for log-monitor verification");
  throw new Error("test error for log-monitor verification");
};

// component export required so react-router treats this as a UI route
// and renders the root ErrorBoundary instead of a raw server error
export default function ErrorTest() {
  return null;
}
