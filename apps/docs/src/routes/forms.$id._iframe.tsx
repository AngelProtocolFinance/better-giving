import {
  FileText,
  Maximize,
  Menu,
  MousePointerClick,
  MoveHorizontal,
  Square,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router";
import { type EmbedMode, EmbedModeProvider } from "#/components/forms";

const NAV_ITEMS = [
  { href: "custom-dimensions", label: "Custom Dimensions", icon: Maximize },
  { href: "flexible-width", label: "Flexible Width", icon: MoveHorizontal },
  { href: "with-border", label: "With Border", icon: Square },
  { href: "donate-button", label: "Donate Button", icon: MousePointerClick },
  { href: "with-content", label: "With Content", icon: FileText },
];

// (iframe) pathless group layout under next: responsive grid nav (side nav on
// md+, hamburger on mobile) wrapping the playground pages in an
// EmbedModeProvider. seeds the initial embed mode from ?mode=iframe|script.
export default function IframeLayout() {
  const params = useParams();
  const { pathname } = useLocation();
  const [search_params] = useSearchParams();
  const id = params.id as string;
  const [is_open, set_is_open] = useState(false);

  const mode_param = search_params.get("mode");
  const initial_mode: EmbedMode =
    mode_param === "iframe" || mode_param === "script" ? mode_param : "iframe";

  const active_item = NAV_ITEMS.find(
    (item) => pathname === `/forms/${id}/${item.href}`
  );

  return (
    <EmbedModeProvider initial_mode={initial_mode}>
      <div className="grid grid-rows-[auto_1fr] md:grid-rows-none md:grid-cols-[auto_1fr] flex-1">
        <nav className="border-b border-neutral-200 md:border-b-0 md:border-r p-2">
          <div className="md:hidden flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => set_is_open(!is_open)}
              className="rounded hover:bg-neutral-50"
              aria-label={is_open ? "Close menu" : "Open menu"}
            >
              {is_open ? <X size={18} /> : <Menu size={18} />}
            </button>
            {active_item && !is_open && (
              <span className="text-sm font-medium text-neutral-900">
                {active_item.label}
              </span>
            )}
          </div>

          <ul
            className={`
              grid grid-cols-[auto_1fr] gap-y-1
              ${is_open ? "grid mt-2" : "hidden md:grid"}
            `}
          >
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const full_href = `/forms/${id}/${href}`;

              return (
                <li key={href} className="grid grid-cols-subgrid col-span-2">
                  <NavLink
                    to={full_href}
                    onClick={() => set_is_open(false)}
                    className={({ isActive }) => `
                      grid grid-cols-subgrid col-span-2 items-center gap-3 px-3 py-2 rounded
                      transition-colors text-sm
                      ${
                        isActive
                          ? "bg-neutral-100 text-neutral-900 font-medium"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                      }
                    `}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          size={18}
                          className={
                            isActive ? "text-neutral-700" : "text-neutral-400"
                          }
                        />
                        <span className="whitespace-nowrap">{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </EmbedModeProvider>
  );
}
