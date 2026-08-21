import { Modal } from "@better-giving/ui";
import { useNavigate } from "react-router";
import type { Route } from "./+types/route";
import { Form } from "./form";

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";

export default function Page({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();

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
      classes="grid border bg-background"
    >
      <Form user={loaderData} />
    </Modal>
  );
}
