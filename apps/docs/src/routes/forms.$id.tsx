import { Outlet } from "react-router";

// basic flex wrapper.
export default function FormsLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Outlet />
    </div>
  );
}
