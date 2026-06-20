import { Clipboard } from "@ark-ui/react/clipboard";
import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { unpack } from "#/helpers/unpack";

type Classes = string | { container?: string; icon?: string };

type Props = {
  text: string;
  classes?: Classes;
  size?: { copy?: number; check?: number } | number;
  children?: ReactNode;
};

const copy_wait_time = 700;

export function Copier({ text, classes, size, children }: Props) {
  const { container, icon } = unpack(classes);
  const { check = 16, copy = 16 } = size
    ? typeof size === "number"
      ? { check: size, copy: size }
      : size
    : {};
  return (
    <Clipboard.Root value={text} timeout={copy_wait_time} className="contents">
      <Clipboard.Trigger className={`${container} relative`}>
        <Clipboard.Indicator
          className="contents"
          copied={
            <Check
              className={`${icon} text-success`}
              size={check}
              aria-label="Copied"
            />
          }
        >
          <Copy className={`${icon}`} size={copy} aria-label="Copy" />
        </Clipboard.Indicator>
        {children}
      </Clipboard.Trigger>
    </Clipboard.Root>
  );
}
