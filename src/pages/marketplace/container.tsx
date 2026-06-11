import { Minus, Plus } from "lucide-react";
import type React from "react";
import { type PropsWithChildren, useState } from "react";

type Props = PropsWithChildren<{
  title: string;
  expanded?: true;
  classes?: string;
}>;

export function Container({ expanded, title, children, classes = "" }: Props) {
  const [open, set_open] = useState(true);

  return (
    <div className={`flex flex-col gap-px w-full border rounded ${classes}`}>
      {expanded ? (
        <StaticHeader title={title} />
      ) : (
        <Header
          is_open={open}
          title={title}
          on_click={() => set_open((prev) => !prev)}
        />
      )}
      {open && children}
    </div>
  );
}

type HeaderProps = {
  classes?: string;
  title: string;
  children?: React.ReactNode;
};

function StaticHeader({ title, classes = "", children }: HeaderProps) {
  return (
    <div
      className={`flex items-center justify-between px-8 py-5 w-full bg-card rounded ${classes}`}
    >
      <span className=" font-bold text-xl">{title}</span>
      {children}
    </div>
  );
}

function Header(props: {
  title: string;
  is_open: boolean;
  on_click: () => void;
}) {
  return (
    <StaticHeader classes={props.is_open ? "border-b" : ""} title={props.title}>
      <button
        type="button"
        onClick={props.on_click}
        className="flex items-center justify-center p-px size-10 border rounded"
        aria-label="toggle section content's visibility"
      >
        {props.is_open ? <Minus size={18} /> : <Plus size={18} />}
      </button>
    </StaticHeader>
  );
}
