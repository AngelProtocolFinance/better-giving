import {
  NavLink,
  Outlet,
  type ShouldRevalidateFunction,
  useParams,
} from "react-router";
import { admin_ctx } from "#/.server/auth";
import { npo_donor_tab_counts } from "$/pg/queries/donor";
import type { Route } from "./+types/route";

export { ErrorBoundary } from "#/components/error";

export const loader = async (x: Route.LoaderArgs) => {
  const npo_id = x.context.get(admin_ctx);
  return npo_donor_tab_counts(npo_id);
};

// only revalidate on path change — child sort/cursor params shouldn't refetch tab counts
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) =>
  currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;

export default function Page({
  loaderData: { donor_total, sub_count },
}: Route.ComponentProps) {
  const { id } = useParams<{ id: string }>();
  if (!id) throw new Error("missing npo id");
  const base = `/admin/${id}/donors`;
  return (
    <div className="px-6 py-4 md:px-10 md:py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-3xl font-bold tracking-tight">Donors</h2>
        <div className="inline-flex gap-1 rounded bg-muted p-1">
          <Tab to={base} end count={donor_total}>
            All donors
          </Tab>
          <Tab to={`${base}/subscribers`} count={sub_count}>
            Subscribers
          </Tab>
        </div>
      </div>
      <Outlet />
    </div>
  );
}

interface ITabProps {
  to: string;
  count: number;
  end?: boolean;
  children: React.ReactNode;
}

function Tab({ to, count, end, children }: ITabProps) {
  return (
    <NavLink
      to={to}
      end={end}
      prefetch="intent"
      className={({ isActive }) =>
        [
          "inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium transition-colors",
          isActive
            ? "bg-background text-fg shadow-sm"
            : "text-muted-fg hover:text-fg",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          {children}
          <span
            className={[
              "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
              isActive
                ? "bg-muted text-muted-fg"
                : "bg-background text-muted-fg",
            ].join(" ")}
          >
            {count.toLocaleString("en-US")}
          </span>
        </>
      )}
    </NavLink>
  );
}
