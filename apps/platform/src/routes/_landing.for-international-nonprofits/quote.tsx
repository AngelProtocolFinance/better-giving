export function Quote({ classes = "" }) {
  return (
    <section className={classes}>
      <div className="page">
        <figure className="max-w-4xl mx-auto grid gap-4">
          <blockquote className="text-xl md:text-2xl/snug font-semibold text-pretty">
            &ldquo;U.S. donors wanted to support us for years. The tax deduction
            was the wall. Fiscal sponsorship through Better Giving took that
            wall down in a week.&rdquo;
          </blockquote>
          <figcaption className="text-sm text-gray-11">
            CASD Sierra Leone, fiscally sponsored partner
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
