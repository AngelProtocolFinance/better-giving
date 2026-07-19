import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { DrawerIcon } from "#/components/icon";
import { Arrow, Content, Tooltip } from "#/components/tooltip";

type Props = {
  id: string;
  classes?: string;
};

export default function Reference({ id, classes = "" }: Props) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  return (
    <div
      className={`${classes} w-full py-4 px-6 text-sm text-left md:text-center bg-background md:text-muted-fg md: md:border-t rounded-b`}
    >
      <div className="relative">
        <span className="font-semibold mr-2">Your registration number:</span>
        <span className="block mt-1 md:inline md:mt-0">{id}</span>

        <Tooltip
          tip={
            <Content className="p-3 text-xs bg-popover outline outline-border text-popover-fg max-w-xs rounded">
              {tooltip}
              <Arrow />
            </Content>
          }
        >
          <CircleHelp
            size={13}
            className="hidden md:inline-block ml-[1.333rem]"
          />
        </Tooltip>
        <button
          type="button"
          onClick={() => {
            setIsTooltipOpen((p) => !p);
          }}
          className="absolute -right-1 top-1/2 transform -translate-y-1/2 md:hidden"
        >
          <DrawerIcon is_open={isTooltipOpen} size={20} />
        </button>
      </div>
      {isTooltipOpen && (
        <p className="md:hidden mt-4 text-muted-fg">{tooltip}</p>
      )}
    </div>
  );
}

const tooltip =
  "Enter this number on the registration page to continue from where you finished.";
