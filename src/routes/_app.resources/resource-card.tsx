import { Download, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";
import { type Resource, type ResourceType, TYPE_LABELS } from "./data";

const badge_styles: Record<ResourceType, string> = {
  templates: "bg-lilac/40 text-[#6b21a8] dark:bg-lilac/20 dark:text-lilac",
  guides: "bg-success/10 text-success dark:text-success",
  whitepapers: "bg-secondary text-primary",
};

export function ResourceCard({ resource }: { resource: Resource }) {
  const [pending, set_pending] = useState(false);
  return (
    <div className="grid grid-rows-[auto_auto_1fr_auto_auto] rounded border bg-card p-5 gap-3">
      <div className="flex items-center gap-3">
        <FileText size={20} className="text-primary shrink-0" />
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge_styles[resource.type]}`}
        >
          {TYPE_LABELS[resource.type]}
        </span>
      </div>

      <h3 className="font-semibold leading-snug">{resource.name}</h3>

      <p className="text-sm text-muted-fg leading-relaxed">
        {resource.description}
      </p>

      <div className="flex gap-2 mt-1">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            set_pending(true);
            try {
              const res = await fetch(resource.url);
              const blob = await res.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = resource.url.split("/").pop() || "download.pdf";
              a.click();
              URL.revokeObjectURL(a.href);
            } finally {
              set_pending(false);
            }
          }}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium"
        >
          <Download size={14} />
          {pending ? "Downloading..." : "Download"}
        </button>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border hover:bg-muted"
        >
          <ExternalLink size={14} />
          View
        </a>
      </div>

      {resource.size && (
        <p className="text-xs text-muted-fg">{resource.size}</p>
      )}
    </div>
  );
}
