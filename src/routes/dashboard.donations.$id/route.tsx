import { useNavigate } from "react-router";
import { Modal } from "#/components/modal";
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
      classes="fixed-center grid z-10 w-full max-w-[95vw] max-h-[95vh] sm:max-w-md overflow-y-auto scrollbar-gutter-stable scrollbar-thin scrollbar-thumb-ring scrollbar-track-border border bg-background rounded"
    >
      <Form user={loaderData} />
    </Modal>
  );
}
