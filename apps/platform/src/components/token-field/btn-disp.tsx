import { DrawerIcon } from "@better-giving/ui";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import type { TTokenState } from "./types";

export const btn_disp = (open: boolean, btn: TTokenState, classes?: string) => {
  if (btn === "loading") {
    return (
      <LoaderCircleIcon
        test-id="token-loader"
        className={`icon-lg animate-spin ${classes}`}
      />
    );
  }
  if (btn === "error") {
    return (
      <CircleAlertIcon
        test-id="token-error"
        className={`icon-lg text-destructive ${classes}`}
      />
    );
  }
  return <DrawerIcon size={20} is_open={open} className={classes} />;
};
