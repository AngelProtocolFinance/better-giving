import {
  Church,
  Heart,
  HeartHandshake,
  Hospital,
  University,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import type { EndowDesignation } from "@/npo";

const icons: {
  [key in EndowDesignation]: typeof Church;
} = {
  Charity: Heart,
  "Religious Organization": Church,
  University: University,
  Hospital: Hospital,
  Other: HeartHandshake,
};

export function EndowDesignationTag({
  endow_designation,
}: {
  endow_designation: EndowDesignation;
}) {
  if (endow_designation === "Other") return null;
  const Ico = icons[endow_designation];

  return (
    <div className="space-y-3">
      <Tag>
        <Ico size={20} /> {endow_designation}
      </Tag>
    </div>
  );
}

const Tag = (props: PropsWithChildren) => (
  <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-full font-semibold text-sm">
    {props.children}
  </div>
);
