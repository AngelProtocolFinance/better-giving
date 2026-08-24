import { type PropsWithChildren, useId } from "react";

/** a titled section of a form — the fields that belong together, on their own
 *  card. `title` is what makes it one: a named `<section>` is a region a screen
 *  reader can jump to, an unnamed one is a `<div>` with extra letters, so the
 *  name is wired rather than left to the heading sitting nearby. */
export function Group({
  className = "",
  description,
  title,
  children,
}: PropsWithChildren<{
  title?: string;
  description?: string;
  className?: string;
}>) {
  const id = useId();
  return (
    <section
      aria-labelledby={title ? id : undefined}
      className={`grid w-full gap-6 p-6 border rounded bg-card ${className}`}
    >
      {/* the heading pair is one grid child, not two. as two it needed a
          `-mt-4` to claw back the row gap, which pinned the pair's spacing to
          whatever `gap-6` happened to be — move the gap and the title lands on
          the description. */}
      {(title || description) && (
        <div className="grid gap-2">
          {title && (
            <h3 id={id} className="text-2xl">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-lg font-semibold">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
