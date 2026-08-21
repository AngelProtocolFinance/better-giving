import { Modal } from "@better-giving/ui";
import { useLoaderData, useNavigate } from "react-router";
import type { ILoaderData } from "./api";
import { Form } from "./form";

export { ErrorModal as ErrorBoundary } from "#/components/error";

export default function Page() {
  const loaderData = useLoaderData<ILoaderData>();
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
      classes="grid isolate border bg-background"
    >
      <Form {...loaderData} />
    </Modal>
  );
}
