import { ContentLoader } from "@better-giving/ui";

export function Skeleton() {
  return (
    <section className="pb-8 grid grid-cols-[3fr_2fr] gap-4 page pt-24">
      <ContentLoader className="h-52 sm:h-72 rounded shadow-2xl shadow-black/10" />
      <ContentLoader className="h-52 sm:h-72 rounded shadow-2xl shadow-black/10" />
      <ContentLoader className="h-52 sm:h-72 rounded shadow-2xl shadow-black/10" />
      <ContentLoader className="h-52 sm:h-72 rounded shadow-2xl shadow-black/10" />
    </section>
  );
}
