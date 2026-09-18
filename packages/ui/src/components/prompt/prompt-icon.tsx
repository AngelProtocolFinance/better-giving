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
      return <CircleCheck className={`${common} text-success pictogram-lg`} />;
    case "error":
      return (
        <CircleAlert className={`${common} text-destructive pictogram-lg`} />
      );
    case "loading":
      return <LoaderRing thickness={12} classes={`${common} h-24`} />;
    default:
      return null;
  }
}
