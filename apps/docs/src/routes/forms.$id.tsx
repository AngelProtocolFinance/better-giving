import { Outlet } from "react-router";

// basic flex wrapper (was forms/[id]/layout.tsx under next).
export default function FormsLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Outlet />
    </div>
  );
}
