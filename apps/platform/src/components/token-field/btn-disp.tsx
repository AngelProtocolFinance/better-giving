import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { DrawerIcon } from "../icon";
import type { TTokenState } from "./types";

export const btn_disp = (open: boolean, btn: TTokenState, classes?: string) => {
  if (btn === "loading") {
    return (
      <LoaderCircleIcon
        test-id="token-loader"
        className={`animate-spin ${classes}`}
        size={20}
      />
    );
  }
  if (btn === "error") {
    return (
      <CircleAlertIcon
        test-id="token-error"
        className={`text-destructive ${classes}`}
        size={20}
      />
    );
  }
  return <DrawerIcon size={20} is_open={open} className={classes} />;
};
