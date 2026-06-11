import { Image } from "lucide-react";

export function ImagePlaceholder({ className = "" }) {
  return (
    <div
      className={`${className} flex items-center justify-center bg-secondary`}
    >
      <Image className="w-1/2 h-1/2 text-secondary-fg" />
    </div>
  );
}
