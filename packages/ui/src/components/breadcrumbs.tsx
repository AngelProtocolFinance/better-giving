import { Fragment } from "react";
import { NavLink } from "react-router";

type Props = {
  classes?: string;
  items: {
    title: string;
    to: string;
    end?: boolean;
  }[];
};

export function Breadcrumbs({ items, classes = "" }: Props) {
  return (
    <div className={`flex justify-center items-center gap-1 ${classes}`}>
      {items.map((item, i) => (
        <Fragment key={i}>
          <NavLink
            end={item.end}
            to={item.to}
            className={({ isActive }) =>
              `max-w-xs truncate ${
                isActive
                  ? "font-bold cursor-default pointer-events-none"
                  : "underline hover:text-primary"
              }`
            }
          >
            {item.title}
          </NavLink>
          {i < items.length - 1 && ">"}
        </Fragment>
      ))}
    </div>
  );
}
