import { href, Link, useLocation } from "react-router";
import { DappLogo } from "#/components/image";
import { auth_routes } from "#/constants/routes";
import { use_user } from "#/hooks/use-user";
import { AuthBtns } from "./auth-btns";
import { UserAvatar } from "./user-avatar";

interface IAppHeader {
  variant?: "default" | "minimal" | "bare";
  classes?: string;
}

export function AppHeader({ variant = "default", classes }: IAppHeader) {
  const { user } = use_user();
  const { pathname: p, search: s } = useLocation();
  const to = auth_routes.includes(p) ? undefined : p + s;

  return (
    <header
      className={`${classes} bg-popover flex items-center gap-4 px-6 py-2 border-b`}
      ref={(node) => {
        if (!node) return;
        const observer = new IntersectionObserver(
          ([e]) => {
            const isIntersecting = e.intersectionRatio < 1;
            e.target.classList.toggle("shadow-lg", isIntersecting);
          },
          { threshold: [1] }
        );
        observer.observe(node);
        return () => observer.disconnect();
      }}
    >
      <div className="flex-1">
        <DappLogo classes="h-12 w-auto inline-block" />
      </div>
      {variant !== "bare" && <AuthSlot variant={variant} user={user} to={to} />}
    </header>
  );
}

interface IAuthSlot {
  variant: "default" | "minimal";
  user: ReturnType<typeof use_user>["user"];
  to: string | undefined;
}

function AuthSlot({ variant, user, to }: IAuthSlot) {
  const is_loading = user === "loading";
  // fixed width reserves the slot so resolving SWR state doesn't reflow the header
  return (
    <div className="flex-none flex items-center justify-end w-48">
      {!is_loading && user && (
        <Link to={href("/dashboard/donations")}>
          <UserAvatar avatar={user.avatar_url} classes="size-10" />
        </Link>
      )}
      {/* loading: render nothing visible; correct control appears when SWR resolves */}
      {!is_loading && !user && to && variant === "default" && (
        <AuthBtns to={to} />
      )}
      {!is_loading && !user && to && variant === "minimal" && (
        <Link
          to={`${href("/login")}?redirect=${encodeURIComponent(to)}`}
          className="btn btn-secondary rounded-sm px-5 py-2.5 text-sm"
        >
          Log In
        </Link>
      )}
    </div>
  );
}
