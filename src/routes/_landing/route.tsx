import { Outlet } from "react-router";
import { Footer } from "#/components/footer";
import { Header } from "#/components/header";

export { ErrorBoundary } from "#/components/error";

export default function Layout() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[4rem_minmax(calc(100dvh-4rem),1fr)_auto]">
      <Header classes="sticky z-40 -top-px" />
      <Outlet />
      <Footer />
    </div>
  );
}
