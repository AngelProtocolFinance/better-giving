import { Modal } from "@better-giving/ui";
import { useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/route";
import { Form } from "./form";

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  // lifted so the dialog can hold itself open while the form submits
  const fetcher = useFetcher();

  return (
    <Modal
      open={true}
      onClose={() =>
        navigate(
          { pathname: ".." },
          { replace: true, preventScrollReset: true }
        )
      }
      size="panel"
      title="View receipt"
      classes="grid border bg-background"
      busy={fetcher.state !== "idle"}
    >
      <Form user={loaderData} fetcher={fetcher} />
    </Modal>
  );
}
