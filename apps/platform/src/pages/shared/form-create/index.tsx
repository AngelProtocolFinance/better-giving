import { useLoaderData, useNavigate } from "react-router";
import { Modal } from "#/components/modal";
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
      classes="fixed-center grid z-50 isolate w-full max-w-[95vw] max-h-[95vh] sm:max-w-md overflow-y-auto scrollbar-gutter-stable scrollbar-thin scrollbar-thumb-ring scrollbar-track-border border bg-background rounded"
    >
      <Form {...loaderData} />
    </Modal>
  );
}
