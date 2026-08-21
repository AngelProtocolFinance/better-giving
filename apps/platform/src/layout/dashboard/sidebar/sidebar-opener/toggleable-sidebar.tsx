import { Modal } from "@better-giving/ui";
import { Sidebar } from "../sidebar";
import type { LinkGroup } from "../types";

interface Props {
  linkGroups: LinkGroup[];
  open: boolean;
  set_open: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ToggleableSidebar({ linkGroups, set_open, open }: Props) {
  return (
    <Modal
      open={open}
      onClose={() => set_open(false)}
      size="none"
      classes="fixed top-0 left-0 h-full"
    >
      <Sidebar
        className="overflow-y-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border"
        linkGroups={linkGroups}
        onChange={() => set_open(false)}
      />
    </Modal>
  );
}
