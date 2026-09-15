import { CircleCheck } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Status } from "./status";

type Props = PropsWithChildren<{
  classes?: string;
}>;

export function Confirmed({ classes = "", children }: Props) {
  return (
    <Status
      inline
      classes={`${classes} text-sm text-success-subtle-fg`}
      icon={<CircleCheck className="mr-2 inline-block relative icon-md" />}
    >
      {children}
    </Status>
  );
}
