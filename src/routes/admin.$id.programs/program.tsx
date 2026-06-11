import { Link, useFetcher } from "react-router";
import { Image } from "#/components/image";
import { LoaderRing } from "#/components/loader-ring";
import { routes } from "#/pages/admin/routes";
import type { IProgramDb } from "@/npo";

export function Program(props: IProgramDb) {
  const fetcher = useFetcher();

  const isDeleting = fetcher.state !== "idle";

  return (
    <div
      className={`p-4 rounded border ${
        isDeleting ? "bg-muted" : "bg-card"
      } grid @lg:flex items-center gap-x-4 gap-y-4`}
    >
      <div className="flex items-center gap-x-4 @lg:contents">
        <Image
          src={props.banner}
          alt="program banner"
          className="w-10 aspect-square object-cover"
        />
        <p className="font-bold">{props.title}</p>
      </div>

      {isDeleting ? (
        <LoaderRing thickness={10} classes="@lg:ml-auto w-6" />
      ) : (
        <fetcher.Form
          method="DELETE"
          className="flex items-center gap-x-4 @lg:contents"
        >
          <button
            type="submit"
            name="programId"
            value={props.id}
            className="btn-secondary btn w-24 py-2 text-sm @lg:ml-auto"
          >
            delete
          </button>
          <Link
            to={`../${routes.program_editor}/${props.id}`}
            className="btn-secondary btn w-24 py-2 text-sm"
          >
            edit
          </Link>
        </fetcher.Form>
      )}
    </div>
  );
}
