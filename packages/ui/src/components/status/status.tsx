import type { StatusProps } from "./types";

export function Status({
  icon,
  inline = false,
  classes = "",
  gap = "gap-2",
  children,
}: StatusProps) {
  return (
    <div className={`${classes} ${gap} ${inline ? "" : "flex items-start"}`}>
      {inline ? (
        icon
      ) : (
        // the box is one line tall, so a wrap keeps the icon on the first line
        <span className="flex h-lh shrink-0 items-center">{icon}</span>
      )}
      <span>{children}</span>
    </div>
  );
}
