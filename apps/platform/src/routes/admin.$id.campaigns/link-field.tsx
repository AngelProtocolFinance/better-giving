import { ExtLink, Label } from "@better-giving/ui";
import type { UseFormRegisterReturn } from "react-hook-form";
import { SLUG_HELP, SLUG_LOCK_NOTE, SLUG_PUBLISH_LOCK } from "./copy";

const PLACEHOLDER_SEGMENT = "your-campaign";

interface ILinkField {
  reg: UseFormRegisterReturn<"slug">;
  value: string;
  /** `https://host/org/<org-slug>/`; null when the org has no slug yet, so
   * there is no public link to show */
  base: string | null;
  /** published: the link is live and can no longer change */
  locked: boolean;
  error?: string;
}

/** the slug input, framed as the last segment of the campaign's public link */
export function LinkField({ reg, value, base, locked, error }: ILinkField) {
  const id = `__${reg.name}`;
  const sub_id = `__sub_${reg.name}`;
  const prefix_id = `__prefix_${reg.name}`;
  const error_id = `__error_${reg.name}`;
  const segment = value.trim();
  const url = base && `${base}${segment || PLACEHOLDER_SEGMENT}`;
  const described = [sub_id, base ? prefix_id : "", error ? error_id : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-w-0">
      <Label required htmlFor={id}>
        Campaign link
      </Label>
      <p id={sub_id} className="text-gray-11 text-sm mb-2 break-words">
        {locked ? SLUG_LOCK_NOTE : `${SLUG_HELP}. ${SLUG_PUBLISH_LOCK}`}
      </p>
      {/* the prefix gives way first: it truncates from its start so the org
          segment beside the input stays readable, and the input keeps a floor */}
      <div className="field-input-container flex min-h-(--field-size)">
        {base && (
          <span
            id={prefix_id}
            className="flex items-center min-w-0 pl-4 text-gray-11 select-none"
          >
            {/* rtl puts the ellipsis at the start; the inner ltr span keeps
                the url's own order */}
            <span dir="rtl" className="truncate min-w-0">
              <span dir="ltr">{base.replace(/^https?:\/\//, "")}</span>
            </span>
          </span>
        )}
        <input
          {...reg}
          id={id}
          type="text"
          disabled={locked}
          aria-disabled={locked || undefined}
          aria-required
          aria-invalid={!!error}
          aria-errormessage={error_id}
          aria-describedby={described}
          autoComplete="off"
          spellCheck={false}
          className={`min-w-32 flex-1 bg-transparent py-3.5 pr-4 outline-none ${base ? "" : "pl-4"}`}
        />
      </div>
      {url && (
        <p className="mt-1 text-sm text-gray-11 break-all">
          Donors will find this campaign at{" "}
          {locked ? (
            <ExtLink href={url} className="link">
              {url}
            </ExtLink>
          ) : (
            url
          )}
        </p>
      )}
      <p id={error_id} className="field-err mt-1 empty:hidden">
        {error}
      </p>
    </div>
  );
}
