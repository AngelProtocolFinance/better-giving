import { RouteModal } from "#/components/route-modal";
import { Panel } from "./panel";
import type { Props } from "./types";

export function Form(props: Props) {
  return (
    <RouteModal>
      <Panel {...props} />
    </RouteModal>
  );
}
