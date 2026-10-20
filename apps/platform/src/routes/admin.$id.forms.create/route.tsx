import type { MetaFunction } from "react-router";
import { admin_page_meta } from "#/routes/admin.$id/page-meta";

export { default, ErrorBoundary } from "#/pages/shared/form-create";
export { action, loader } from "#/pages/shared/form-create/api";

export const meta: MetaFunction = ({ matches }) =>
  admin_page_meta("Create donation form", matches);
