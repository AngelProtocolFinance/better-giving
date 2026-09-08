import { Image } from "lucide-react";

export function ImagePlaceholder({ classes = "" }) {
  return (
    <div className={`${classes} flex items-center justify-center bg-secondary`}>
      <Image className="w-1/2 h-1/2 text-gray-12" />
    </div>
  );
}
