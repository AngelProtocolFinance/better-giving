import { LoaderCircleIcon } from "lucide-react";
import { useLocation } from "react-router";
import { AuthLinks, NavDropdown } from "#/components/header";
import { DappLogo } from "#/components/image";
import { auth_routes } from "#/constants/routes";
import { use_user } from "#/hooks/use-user";

type Props = { classes?: string };

export function Header({ classes }: Props) {
  const { user } = use_user();
  const { pathname: p, search: s } = useLocation();
  const to = auth_routes.includes(p) ? undefined : p + s;

  return (
    <header
      className={`${classes} bg-popover flex items-center gap-4 pr-6 py-2 border-b`}
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
      }}
    >
      <div className="flex-1">
        <DappLogo classes="w-48 h-12 inline-block" />
      </div>
      {user === "loading" && (
        <LoaderCircleIcon className="flex-none animate-spin stroke-primary" />
      )}
      {user !== "loading" && (
        <NavDropdown
          classes="flex-none"
          auth_links={to && !user && <AuthLinks to={to} classes="sm:hidden" />}
          user={user}
        />
      )}
    </header>
  );
}
