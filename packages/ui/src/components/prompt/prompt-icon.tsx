import { CircleAlert, CircleCheck } from "lucide-react";
import { LoaderRing } from "../loader-ring";
import type { Props } from "./types";

export function PromptIcon({
  type,
  classes = "",
}: Pick<Props, "type"> & { classes?: string }) {
  const common = `justify-self-center ${classes}`;
  switch (type) {
    case "success":
      return <CircleCheck size={92} className={`${common} text-success`} />;
    case "error":
      return <CircleAlert size={80} className={`${common} text-destructive`} />;
    case "loading":
      return <LoaderRing thickness={12} classes={`${common} h-24`} />;
    default:
      return null;
  }
}
