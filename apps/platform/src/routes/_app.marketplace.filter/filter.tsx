import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { modal_box } from "@better-giving/ui/helpers";
import { X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import Categories from "./categories";
import Countries from "./countries";
import Designations from "./designations";
import KYCFilter from "./kyc-filter";
// import { VerificationFilter } from "./verification-filter";

export default function Filter({ classes = "" }: { classes?: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(e) => {
        if (!e.open)
          navigate(
            { pathname: "..", search: params.toString() },
            { replace: true, preventScrollReset: true }
          );
      }}
    >
      <Portal>
        <Dialog.Backdrop className="fixed z-40 inset-0 bg-fg/30" />
        <Dialog.Positioner className="contents">
          <Dialog.Content
            className={`${classes} ${modal_box.panel} isolate border bg-background`}
          >
            <div className="bg-muted flex items-center p-4 border-b">
              <p className="font-bold  uppercase mr-auto">Filters</p>
              <button
                type="button"
                title="Reset all filters to their default values."
                onClick={() =>
                  navigate(
                    { pathname: "..", search: "" },
                    { replace: true, preventScrollReset: true }
                  )
                }
                className="text-muted-fg text-sm mr-4"
              >
                Clear Filters
              </button>
              <Link
                to={{ pathname: "..", search: params.toString() }}
                replace
                preventScrollReset
                aria-label="Close filters"
                className="active:text-primary"
              >
                <X size={22} />
              </Link>
            </div>

            <div className="px-4 py-4">
              <p className="font-bold text-xs  uppercase block mb-2">
                Countries
              </p>
              <Countries />
            </div>

            <div className="px-2 divide-y divide-border">
              <Designations />
              <KYCFilter />
              {/* <VerificationFilter /> */}
              <Categories />
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
