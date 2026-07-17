import { ArrowUpFromLine, LoaderCircle } from "lucide-react";
import { ExtLink } from "../ext-link";

interface Props {
  value?: string | File;
}

export function DropzoneText({ value }: Props) {
  if (value == null || value === "") {
    return (
      <div className="grid justify-items-center text-sm text-muted-fg select-none">
        <ArrowUpFromLine size={20} className="mb-4.5" />
        <p className="font-semibold mb-1">Upload file</p>
        <span>Click to Browse or Drag &amp; Drop</span>
      </div>
    );
  }
  if (value === "loading") {
    return (
      <div className="grid place-items-center">
        <LoaderCircle className="text-muted-fg animate-spin" />
      </div>
    );
  }

  if (value instanceof File) {
    return (
      <p className="text-sm text-center block text-primary hover:text-primary/80">
        {value.name}
      </p>
    );
  }
  return (
    <ExtLink
      onClickCapture={(ev) => ev.stopPropagation()}
      href={value}
      className="text-sm text-center block text-primary hover:text-primary/80"
    >
      {value}
    </ExtLink>
  );
}
