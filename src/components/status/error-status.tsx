import { CircleAlert } from "lucide-react";
import { Status } from "./status";
import type { StatusProps } from "./types";

export function ErrorStatus({
  classes = "",
  children,
}: Omit<StatusProps, "icon">) {
  return (
    <Status classes={`text-destructive ${classes}`} icon={<CircleAlert />}>
      {children}
    </Status>
  );
}
