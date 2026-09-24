import type { RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

// test files colocate with routes; any registered module is imported at server boot, so a top-level vi.mock() crashes prod
export default flatRoutes({
  ignoredRouteFiles: ["**/*.test.{ts,tsx}"],
}) satisfies RouteConfig;
