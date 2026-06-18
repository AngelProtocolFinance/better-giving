import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { ArrowDownToLine, CircleCheck } from "lucide-react";
import { Link, useNavigate, useNavigation } from "react-router";
import type { Route } from "./+types/route";
import type { LoaderData } from "./api";

export { ErrorModal as ErrorBoundary } from "#/components/error";
export { loader } from "./api";

export default function Page({ loaderData: data }: Route.ComponentProps) {
  const navigate = useNavigate();
  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open)
          navigate("..", { replace: true, preventScrollReset: true });
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Content {...data} />
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function Content(props: LoaderData) {
  const navigation = useNavigation();
  const is_loading = navigation.state === "loading";

  return (
    <Dialog.Content className="z-50 fixed-center grid bg-popover text-popover-fg sm:w-full w-[90vw] sm:max-w-lg rounded p-6 text-center">
      <CircleCheck className="text-success mx-auto" size={70} />
      <h1 className="text-2xl uppercase text-center mt-10 mb-4">
        Tax Form submission saved!
      </h1>

      <a
        download
        href={`/api/anvil-doc/${props.doc_eid}`}
        className="text-primary hover:text-primary active:text-primary mb-4 inline-block"
      >
        <ArrowDownToLine size={18} className="inline bottom-px relative mr-1" />
        <span className="text-sm font-semibold">Download</span>
      </a>

      <Link
        aria-disabled={is_loading}
        className="w-full max-w-[26.25rem] justify-self-center btn btn-primary text-sm mt-4"
        to="../payout"
      >
        Continue
      </Link>
    </Dialog.Content>
  );
}
