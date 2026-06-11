import { useRouteLoaderData } from "react-router";
import type { LoaderData } from "./types";

export const use_admin_data = (): LoaderData | undefined => {
  return useRouteLoaderData("routes/admin.$id") as any;
};
