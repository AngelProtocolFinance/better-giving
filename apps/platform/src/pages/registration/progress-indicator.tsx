import { Steps } from "@ark-ui/react/steps";
import { useState } from "react";
import { useLocation } from "react-router";
import { DrawerIcon } from "#/components/icon";
import { id_param_to_num } from "#/helpers/id-param-to-num";
import type { Progress } from "@/reg";

const labels = [
  "Contact Details",
  "Organization",
  "Nonprofit Status",
  "Documentation",
  "Banking",
];

type Props = {
  step: Progress["step"];
  classes?: string;
};

export function ProgressIndicator({ step, classes = "" }: Props) {
  const { pathname } = useLocation();
  const paths = pathname.split("/");
  const curr_path = id_param_to_num(paths.at(-1));
  const active_index = curr_path - 1;

  // mobile expansion only; desktop renders all items via CSS regardless.
  // avoids JS-driven `isDesktop` state which caused SSR/hydration layout flash.
  const [is_expanded, set_expanded] = useState(false);

  // anchor mobile toggle button to whichever row is first-visible:
  // expanded → row 0 (Contact); collapsed → the active row (only one shown).
  const first_visible = is_expanded ? 0 : active_index;

  return (
    <div
      style={{ "--gutter": "2.5rem" } as React.CSSProperties}
      className={`pb-4 pt-4 md:pt-2 max-md:pr-(--gutter) pl-12 md:pl-14 md:mr-14 ${classes}`}
    >
      <Steps.Root
        step={Math.min(step, 5)}
        count={5}
        orientation="vertical"
        data-expanded={is_expanded || undefined}
        className="group/root w-full"
      >
        <Steps.List>
          {labels.map((label, i) => (
            <Steps.Item
              key={i}
              index={i}
              data-curr={i === active_index || undefined}
              className="group hidden data-curr:block group-data-expanded/root:block md:block"
            >
              <div className="h-5.5 border-l group-data-[state=complete]:border-primary group-data-curr:border-primary my-2 group-first:hidden" />
              <div className="flex items-center w-full">
                <div className="w-4 aspect-square bg-muted group-data-[state=complete]:bg-primary rounded-full transform -translate-x-1/2" />
                <span className="text-sm text-muted-fg group-data-curr:text-primary">
                  {label}
                </span>
                {i === first_visible && (
                  <button
                    type="button"
                    onClick={() => set_expanded((p) => !p)}
                    style={{ marginRight: "calc(var(--gutter) * -0.5)" }}
                    className="md:hidden ml-auto p-2 -my-2"
                    aria-label={is_expanded ? "Collapse steps" : "Expand steps"}
                    aria-expanded={is_expanded}
                  >
                    <DrawerIcon is_open={is_expanded} size={20} />
                  </button>
                )}
              </div>
            </Steps.Item>
          ))}
        </Steps.List>
      </Steps.Root>
    </div>
  );
}
