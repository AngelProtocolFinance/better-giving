import { Outlet } from "react-router";
import { PublicFooter, PublicHeader } from "./public-chrome";

// shared shell for the pathless public layout wrappers (`_app`, `_landing`).
// header/footer resolve their intent bucket from the pathname via the chrome
// seam (see public-chrome.tsx).
export function PublicLayout() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[4rem_minmax(calc(100dvh-4rem),1fr)_auto]">
      <PublicHeader classes="sticky z-40 -top-px" />
      <Outlet />
      <PublicFooter />
    </div>
  );
}
