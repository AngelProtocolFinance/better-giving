import { PortableText } from "@portabletext/react";
import { lazy, type Ref, Suspense } from "react";
import { unpack } from "#/helpers/unpack";
import { ContentLoader } from "../content-loader";
import { to_document } from "./helpers";
import { pt_components } from "./pt-components";
import type { Props } from "./types";

const Editor = lazy(() => import("./editor"));

type El = Pick<HTMLDivElement, "focus">;
export function RichText({
  classes,
  ref,
  ...props
}: Props & { ref?: Ref<El> }) {
  const style = unpack(classes);

  return (
    <div className={style.container}>
      <div
        aria-invalid={!!props.error}
        aria-disabled={props.disabled}
        className={`relative has-focus-within:outline-2 has-focus-within:outline-ring ${style.field}`}
      >
        {props.readOnly ? (
          <PortableText
            value={to_document(props.content.value)}
            components={pt_components}
          />
        ) : (
          <Suspense
            fallback={Array(10)
              .fill(null)
              .map((_, index) => (
                <ContentLoader key={index} className="mb-3 h-5 w-full" />
              ))}
          >
            <Editor classes={classes} ref={ref} {...props} />
          </Suspense>
        )}
        {!props.readOnly && (
          <span
            className={`absolute top-4 right-4 text-xs uppercase ${
              style.counter ?? ""
            }`}
          >
            chars : {props.content.length ?? 0}
            {props.charLimit && ` /${props.charLimit}`}
          </span>
        )}
      </div>
      <p
        className={`empty:hidden text-destructive text-xs mt-1 ${style.error}`}
      >
        {props.error}
      </p>
    </div>
  );
}
