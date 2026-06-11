import { nav_link_class_fn } from "#/helpers/create-navlink-styler";

const styles =
  "group font-medium hover:text-fg text-sm w-full grid grid-cols-subgrid col-span-2 items-center";
export const styler = nav_link_class_fn(
  styles,
  "pointer-events-none text-primary",
  ""
);
