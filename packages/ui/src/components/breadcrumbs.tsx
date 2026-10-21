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
    <div className={`flex justify-start items-center gap-1 ${classes}`}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            {last ? (
              <h1 className="max-w-xs truncate font-bold cursor-default">
                {item.title}
              </h1>
            ) : (
              <NavLink
                end={item.end}
                to={item.to}
                className={({ isActive }) =>
                  `max-w-xs truncate ${
                    isActive
                      ? "font-bold cursor-default pointer-events-none"
                      : "link underline"
                  }`
                }
              >
                {item.title}
              </NavLink>
            )}
            {i < items.length - 1 && ">"}
          </Fragment>
        );
      })}
    </div>
  );
}
