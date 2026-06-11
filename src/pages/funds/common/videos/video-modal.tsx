import { valibotResolver } from "@hookform/resolvers/valibot";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { object } from "valibot";
import { Field } from "#/components/form";
import { Modal } from "#/components/modal";
import { videoUrl } from "./types";

interface IVideoModal {
  onSubmit: (url: string) => void;
  initUrl?: string;
  open: boolean;
  set_open: (open: boolean) => void;
}

export function VideoModal(props: IVideoModal) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm({
    resolver: valibotResolver(object({ url: videoUrl })),
    values: { url: props.initUrl ?? "" },
  });

  return (
    <Modal
      open={props.open}
      onClose={() => props.set_open(false)}
      classes="fixed-center z-10 grid bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden"
    >
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit((data) => props.onSubmit(data.url))();
          props.set_open(false);
        }}
      >
        <div className="relative">
          <p className="text-xl font-bold text-center border-b bg-muted p-5">
            {props.initUrl ? "Edit" : "Add"} video
          </p>
          <button
            type="button"
            onClick={() => props.set_open(false)}
            className="border p-2 rounded absolute top-1/2 right-4 transform -translate-y-1/2 disabled:text-muted-fg"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-4">
          <Field
            {...register("url")}
            placeholder="e.g. https://youtu.be/XOUjJqQ68Ec?si=-WX60lgPXUWAXPCY"
            name="url"
            label="Web Address (URL)"
            required
            error={errors.url?.message}
          />
        </div>

        <div className="mt-4 p-3 sm:px-8 sm:py-4 flex items-center justify-end gap-4 w-full text-center sm:text-right bg-muted border-t">
          <button
            type="button"
            className="btn-secondary btn text-sm px-8 py-2"
            onClick={() => props.set_open(false)}
          >
            Cancel
          </button>
          <button
            disabled={!isDirty}
            type="submit"
            className="btn btn-primary px-8 py-2 text-sm"
          >
            Continue
          </button>
        </div>
      </form>
    </Modal>
  );
}
