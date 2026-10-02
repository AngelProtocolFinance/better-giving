import { Actions, Field, Modal, RmxForm } from "@better-giving/ui";
import { X } from "lucide-react";
import {
  Link,
  useNavigate,
  useNavigation,
  useParams,
  useSearchParams,
} from "react-router";
import { useRemixForm } from "remix-hook-form";
import type { ISchema } from "./schema";

export default function Page() {
  const [sp] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();

  return (
    <Modal
      open={true}
      onClose={() =>
        navigate("..", { preventScrollReset: true, replace: true })
      }
      classes="grid bg-panel"
    >
      <Content
        action={params.media_id ? "edit" : "add"}
        prev_url={sp.get("prev_url")}
      />
    </Modal>
  );
}

interface IProps {
  action: "edit" | "add";
  prev_url: string | null;
}

function Content(props: IProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  // aria-disabled only blocks the pointer; Enter on a focused link still navigates
  const hold = (e: { preventDefault(): void }) => {
    if (busy) e.preventDefault();
  };
  const {
    handleSubmit,
    register,
    formState: { errors, isDirty },
  } = useRemixForm<ISchema>({
    defaultValues: { url: props.prev_url ?? "" },
  });

  return (
    <RmxForm
      method="POST"
      disabled={busy}
      busy={nav.state === "submitting"}
      onSubmit={handleSubmit}
    >
      <div className="relative">
        <h2 className="text-xl capitalize font-bold text-center border-b bg-gray-3 p-5">
          {props.action} video
        </h2>
        <Link
          to=".."
          aria-label="Close"
          aria-disabled={busy}
          onClick={hold}
          className="border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 aria-disabled:text-gray-11"
        >
          <X className="icon-2xl" />
        </Link>
      </div>
      <div className="p-4">
        <Field
          {...register("url")}
          placeholder="e.g. https://youtu.be/XOUjJqQ68Ec?si=-WX60lgPXUWAXPCY"
          label="Web Address (URL)"
          error={errors.url?.message}
          required
        />
      </div>

      <Actions band classes="mt-4">
        <Link
          to=".."
          aria-disabled={busy}
          onClick={hold}
          className="btn-secondary btn"
        >
          Cancel
        </Link>
        <button disabled={!isDirty} type="submit" className="btn btn-primary">
          Continue
        </button>
      </Actions>
    </RmxForm>
  );
}
