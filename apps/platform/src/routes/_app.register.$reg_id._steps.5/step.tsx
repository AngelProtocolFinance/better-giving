import { NavLink } from "react-router";

/** the steps that collect something — review itself has no row */
type TStep = 1 | 2 | 3 | 4;
type Props = {
  disabled: boolean;
  num: TStep;
  status?: string;
};

export function Step({
  num,
  status = "Completed" /** not possible to visit this page without completing steps */,
  disabled,
}: Props) {
  return (
    <div
      className={`py-6 pl-2 pr-4 grid grid-cols-[1fr_auto_auto] items-center border-b ${
        num === 1 ? "border-t" : ""
      }`}
    >
      <p className="mr-auto text-left">{title[num]}</p>

      <p className="text-success-subtle-fg font-semibold max-sm:row-start-2">
        {status}
      </p>

      <NavLink
        to={`../${num}`}
        className="min-w-32 ml-6 max-sm:row-span-2 btn-secondary btn"
        aria-disabled={disabled}
      >
        Update
      </NavLink>
    </div>
  );
}

const title: { [key in TStep]: string } = {
  1: "Contact Details",
  2: "Organization",
  3: "Fiscal Sponsorship Agreement",
  4: "Banking",
};
