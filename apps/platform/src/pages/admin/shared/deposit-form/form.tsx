import { useNavigate } from "react-router";
import { RouteModal } from "#/components/route-modal";
import { Panel } from "./panel";
import type { Props } from "./types";

export function Form(props: Props) {
  const navigate = useNavigate();
  const close = () =>
    navigate("..", { replace: true, preventScrollReset: true });

  return (
    <RouteModal>
      <Panel {...props} onClose={close} />
    </RouteModal>
  );
}
