import { Accordion as Ark } from "@ark-ui/react/accordion";
import type { ReactNode } from "react";
import { DrawerIcon } from "./icon/drawer-icon";

export interface IAccordionItem {
  value: string;
  /** the question, or whatever names the panel */
  trigger: ReactNode;
  content: ReactNode;
}

interface Props {
  items: IAccordionItem[];
  /** `compact` is a tight list inside a card; `divided` is a padded, ruled
   * list for a page section; `tiles` sets each row on its own `--secondary`
   * fill, spaced rather than ruled, for a marketing page */
  variant?: "compact" | "divided" | "tiles";
  /** each trigger sits in a heading of this level, so the questions show up in
   *  heading navigation; one below the heading that introduces the list
   *  @default 3 */
  heading_level?: 2 | 3 | 4;
  /** outer placement only — width, margin */
  className?: string;
}

const looks = {
  compact: {
    root: "",
    item: "",
    trigger: "flex items-start justify-between gap-2 mb-2 w-full",
    label: "text-left text-sm group-data-[state=open]:font-semibold",
    content: "text-sm grid gap-3 text-gray-11 mb-6",
  },
  divided: {
    root: "divide-y divide-gray-6",
    item: "",
    trigger: "flex items-center justify-between gap-2 w-full py-6 px-4",
    label: "text-left group-data-[state=open]:font-semibold",
    content: "pb-4 px-4",
  },
  // the row is the trigger's to fill, so the inset sits on the trigger and the
  // answer rather than on the item, and the ring is drawn inside the corner
  tiles: {
    root: "grid gap-3",
    item: "bg-secondary rounded",
    trigger:
      "flex items-center justify-between gap-4 w-full p-6 md:px-8 rounded focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
    label: "text-left group-data-[state=open]:font-semibold",
    content: "px-6 md:px-8 pb-6",
  },
};

export function Accordion({
  items,
  variant = "compact",
  heading_level = 3,
  className = "",
}: Props) {
  const look = looks[variant];
  const Heading = `h${heading_level}` as const;
  return (
    <Ark.Root collapsible className={`${look.root} ${className}`}>
      {items.map((it) => (
        <Ark.Item
          key={it.value}
          value={it.value}
          className={`group ${look.item}`}
        >
          {/* the base layer sets every heading in the display face at bold;
              the trigger's type is its label's, so the heading hands back the
              body's */}
          <Heading className="font-body font-normal">
            <Ark.ItemTrigger className={look.trigger}>
              <span className={look.label}>{it.trigger}</span>
              <DrawerIcon
                is_open={false}
                className="icon-lg shrink-0 group-data-[state=open]:rotate-180"
              />
            </Ark.ItemTrigger>
          </Heading>
          <Ark.ItemContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            <div className={look.content}>{it.content}</div>
          </Ark.ItemContent>
        </Ark.Item>
      ))}
    </Ark.Root>
  );
}
