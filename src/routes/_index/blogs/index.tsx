import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import use_swr from "swr/immutable";
import { posts } from "#/api/get/wp-posts";
import { use_drag_scroll } from "#/hooks/use-drag-scroll";
import { BlogCard, Skeleton } from "./blog-card";

function scroll_carousel(container: HTMLUListElement, direction: -1 | 1) {
  const child = container.firstElementChild;
  if (!child) return;
  const slide_width = child.getBoundingClientRect().width;
  const at_start = container.scrollLeft <= 2;
  const at_end =
    container.scrollLeft + container.clientWidth >= container.scrollWidth - 2;

  if (direction === -1 && at_start) {
    container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
  } else if (direction === 1 && at_end) {
    container.scrollTo({ left: 0, behavior: "smooth" });
  } else {
    container.scrollBy({ left: direction * slide_width, behavior: "smooth" });
  }
}

export const Blogs = ({ classes = "" }) => {
  const { data } = use_swr(["posts", "1"], ([, page]) => posts(+page));
  const ref = useRef<HTMLUListElement>(null);
  use_drag_scroll(ref);

  return (
    <section
      className={`${classes} grid content-start py-40`}
      aria-labelledby="blogs-heading"
    >
      <h2 id="blogs-heading" className="section-heading text-center mb-14 px-4">
        Gain knowledge to empower your nonprofit
      </h2>

      <div className="relative">
        <button
          type="button"
          onClick={() => ref.current && scroll_carousel(ref.current, -1)}
          className="p-4 bg-card text-primary rounded-full shadow-md z-10 absolute top-1/2 -translate-y-1/2 left-10 sm:left-[10%]"
          aria-label="Previous slide"
        >
          <ChevronLeft />
        </button>

        <div className="w-[70vw] md:w-[80vw] lg:w-[65vw] mx-auto">
          <ul
            ref={ref}
            className="flex items-stretch overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-none cursor-grab"
          >
            {(data?.[0] || [1, 2, 3, 4, 5, 6]).map((blog, idx) => (
              <li
                key={idx}
                className="flex-[0_0_100%] md:flex-[0_0_50%] lg:flex-[0_0_33.333%] px-2.5 grid snap-center"
              >
                {typeof blog === "number" ? (
                  <Skeleton />
                ) : (
                  <BlogCard {...blog} />
                )}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={() => ref.current && scroll_carousel(ref.current, 1)}
          className="p-4 bg-card text-primary rounded-full shadow-md z-10 absolute top-1/2 -translate-y-1/2 right-10 sm:right-[10%]"
          aria-label="Next slide"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
};
