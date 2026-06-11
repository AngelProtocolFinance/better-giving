import { LoaderCircleIcon } from "lucide-react";
// import { useState } from "react";
import { useLocation } from "react-router";
import {
  AuthBtns,
  AuthLinks,
  NavDropdown,
  // UserAvatar,
} from "#/components/header";
import { DappLogo } from "#/components/image";
import { auth_routes } from "#/constants/routes";
import { use_user } from "#/hooks/use-user";

// import SearchDropdown from "./search-dropdown";
// import SearchField from "./search-field";

interface Props {
  classes?: string;
}

export function Header({ classes }: Props) {
  const { user } = use_user();
  // const [query, setQuery] = useState("");
  const { pathname: p, search: s } = useLocation();
  const to = auth_routes.includes(p) ? undefined : p + s;

  return (
    <header
      className={`${classes} group bg-popover`}
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
      <div className="flex items-center gap-4 xl:container xl:mx-auto px-5 rounded py-2">
        <div className="flex-1">
          <DappLogo classes="h-12 inline-block" />
        </div>
        {/* <SearchField
          onChange={(txt) => setQuery(txt)}
          classes="max-md:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        /> */}
        {user === "loading" && (
          <LoaderCircleIcon className="flex-none animate-spin stroke-primary" />
        )}
        {user !== "loading" && to && !user && (
          <AuthBtns to={to} classes="max-sm:hidden flex-none" />
        )}
        {user !== "loading" && (
          <NavDropdown
            user={user}
            auth_links={
              to && !user && <AuthLinks to={to} classes="sm:hidden flex-none" />
            }
          />
        )}
      </div>
      {/* <SearchDropdown
        page1={page1}
        query={query}
        classes="mt-4 hidden group-has-[input:focus]:block hover:block absolute left-1/2 -translate-x-1/2"
      /> */}
    </header>
  );
}
