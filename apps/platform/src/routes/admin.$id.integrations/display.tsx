import { Copier } from "@better-giving/ui";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface Props {
  apiKey: string;
  classes?: string;
}
export function Display({ apiKey, classes = "" }: Props) {
  const [keyShown, showKey] = useState(false);

  return (
    <div className={classes}>
      {/* gap, not `space-x`: `Copier` renders its root `display: contents`, and
          a margin on a contents box is dropped — the sibling-margin spelling
          would silently lose the space before the copy button. */}
      <div className="flex items-center gap-2">
        <input
          type={keyShown ? "text" : "password"}
          value={apiKey}
          readOnly
          className="field-input font-mono"
        />
        <button
          type="button"
          onClick={() => showKey(!keyShown)}
          className="btn btn-field btn-icon btn-secondary"
          aria-label={keyShown ? "Hide API Key" : "Show API Key"}
        >
          {keyShown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <Copier
          text={apiKey}
          label="Copy API Key"
          classes={{ container: "btn btn-field btn-icon btn-secondary" }}
        />
      </div>
    </div>
  );
}
