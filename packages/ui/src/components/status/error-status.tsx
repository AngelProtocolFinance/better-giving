import { CircleAlert } from "lucide-react";
import { Status } from "./status";
import type { StatusProps } from "./types";

// rest-spread rather than named props on purpose: the type is derived from
// StatusProps, so anything added there is advertised by this component's
// contract the moment it lands. forwarding by name is how `inline` and `gap`
// came to sit in the published prop table doing nothing.
export function ErrorStatus({
  classes = "",
  children,
  ...rest
}: Omit<StatusProps, "icon">) {
  return (
    <Status
      {...rest}
      classes={`text-destructive ${classes}`}
      icon={<CircleAlert />}
    >
      {children}
    </Status>
  );
}
