import { LoaderCircle } from "lucide-react";
import { Status } from "./status";
import type { StatusProps } from "./types";

// see error-status.tsx on why this spreads rather than forwarding by name.
export function LoadingStatus({
  classes,
  children,
  ...rest
}: Omit<StatusProps, "icon">) {
  return (
    <Status
      {...rest}
      classes={classes}
      icon={<LoaderCircle size={20} className="animate-spin" />}
    >
      {children}
    </Status>
  );
}
