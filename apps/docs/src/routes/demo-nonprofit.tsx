// a FICTIONAL nonprofit's website, and the only page here that is not Better
// Giving. its whole job is to show the donation form sitting in somebody
// else's design, so its brand colors are the --color-demo-* set declared in
// index.css, never the system tokens. its plain greys DO come from the
// semantic palette: neutral slate is not an identity, and duplicating it here
// would only be a second set of greys to keep in sync.
import { BookOpen, ExternalLink, Leaf, Users, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { BG_FORM_ID } from "#/constants";

const DEMO_SECTIONS = [
  { id: "flexible-width", title: "Flexible Width" },
  { id: "with-border", title: "With Border" },
  { id: "donate-button", title: "Donate Button" },
  { id: "with-content", title: "With Content" },
  { id: "fixed-dimensions", title: "Fixed Dimensions" },
] as const;

const PROGRAMS = [
  {
    icon: Leaf,
    title: "Environmental Conservation",
    description: "Protect natural habitats and promote sustainable practices.",
    color: "bg-demo-leaf text-demo-leaf-ink",
  },
  {
    icon: BookOpen,
    title: "Youth Education",
    description: "Provide educational resources and mentorship programs.",
    color: "bg-demo-book text-demo-book-ink",
  },
  {
    icon: Users,
    title: "Community Support",
    description: "Deliver essential services to families facing hardship.",
    color: "bg-demo-people text-demo-people-ink",
  },
];

export default function DemoNonprofitPage() {
  const id = BG_FORM_ID;
  const dialog_ref = useRef<HTMLDialogElement>(null);

  // injecting in an effect keeps it client-only (ssr-safe) and lazy — the
  // script wires up the data-bg-form containers on the page.
  useEffect(() => {
    const src = "https://better.giving/form-embed.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <main className="flex-1">
      <nav className="sticky top-0 bg-panel border-b px-6 py-3 z-10">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-2 justify-center">
          {DEMO_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="px-3 py-1.5 text-sm text-gray-11 hover:text-gray-12 hover:bg-secondary rounded transition-colors"
            >
              {section.title}
            </a>
          ))}
        </div>
      </nav>

      <section
        id="flexible-width"
        className="px-6 py-16 bg-linear-to-br from-demo to-demo-dark scroll-mt-16"
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <div data-bg-form={id} className="rounded overflow-hidden" />
            </div>
            <div className="order-1 md:order-2 text-white">
              <h1 className="text-4xl font-bold mb-4">
                Helping Communities Thrive
              </h1>
              <p className="text-demo-on-dark mb-4">
                Join us in making a difference. Your support helps us deliver
                programs that transform lives across the region.
              </p>
              <p className="text-sm text-demo-on-dark-dim/80">
                <span className="font-medium text-demo-on-dark">
                  Flexible Width
                </span>
                {" — "}Form uses width: 100% to fill available space. Resize
                browser to see it adapt.{" "}
                <ViewCodeLink href={`/forms/${id}/flexible-width`} light />
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="with-border" className="px-6 py-16 bg-panel scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-12 mb-3">
              Support Our Mission
            </h2>
            <p className="text-gray-11 text-sm max-w-lg mx-auto">
              <span className="font-medium text-gray-12">With Border</span>
              {" — "}On white backgrounds, a subtle border separates the form
              from surrounding content.{" "}
              <ViewCodeLink href={`/forms/${id}/with-border`} />
            </p>
          </div>
          <div className="flex justify-center">
            <div
              data-bg-form={id}
              className="w-full max-w-150 rounded border"
            />
          </div>
        </div>
      </section>

      <section id="donate-button" className="px-6 py-16 bg-gray-3 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-12 mb-3">
              Our Programs
            </h2>
            <p className="text-gray-11 text-sm max-w-lg mx-auto">
              <span className="font-medium text-gray-12">Donate Button</span>
              {" — "}Button click opens form in a modal. Great for CTAs without
              dedicating page space.{" "}
              <ViewCodeLink href={`/forms/${id}/donate-button`} />
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PROGRAMS.map((program) => (
              <div
                key={program.title}
                className="bg-panel rounded border p-6 flex flex-col"
              >
                <div
                  className={`w-12 h-12 rounded flex items-center justify-center ${program.color} mb-4`}
                >
                  <program.icon size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-12 mb-2">
                  {program.title}
                </h3>
                <p className="text-gray-11 text-sm mb-6 flex-1">
                  {program.description}
                </p>
                <button
                  type="button"
                  onClick={() => dialog_ref.current?.showModal()}
                  className="w-full px-4 py-2.5 bg-demo text-white font-medium rounded hover:bg-demo-hover transition-colors text-sm"
                >
                  Donate
                </button>
              </div>
            ))}
          </div>

          <dialog
            ref={dialog_ref}
            className="p-0 rounded backdrop:bg-black/50 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0 max-h-[90vh] overflow-y-auto"
          >
            <div className="relative">
              <form method="dialog">
                <button
                  type="submit"
                  aria-label="Close"
                  className="absolute right-2 top-2 z-10 p-1 rounded hover:bg-secondary text-gray-11"
                >
                  <X size={20} />
                </button>
              </form>
              <div data-bg-form={id} className="w-[90vw] max-w-150" />
            </div>
          </dialog>
        </div>
      </section>

      <section id="with-content" className="px-6 py-16 bg-panel scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6 p-6 bg-demo-pale rounded border border-demo-tint">
              <h2 className="text-2xl font-bold text-gray-12 mb-2">
                Help Us Reach $50,000
              </h2>
              <p className="text-gray-11 text-sm mb-4">
                Expand our youth education program to three new communities.
              </p>
              <div className="bg-demo-tint rounded h-3 overflow-hidden mb-2">
                <div
                  className="bg-demo h-full rounded"
                  style={{ width: "68%" }}
                />
              </div>
              <p className="text-xs text-gray-11 mb-4">
                $34,000 raised of $50,000 goal
              </p>
              <p className="text-xs text-gray-11">
                <span className="font-medium text-gray-11">With Content</span>
                {" — "}Wrap the form with headings, campaign progress, or
                context. <ViewCodeLink href={`/forms/${id}/with-content`} />
              </p>
            </div>
            <div data-bg-form={id} className="rounded border" />
          </div>
        </div>
      </section>

      <section
        id="fixed-dimensions"
        className="px-6 py-16 bg-gray-3 scroll-mt-16"
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-[1fr_350px] gap-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-12">
                Latest Updates
              </h2>
              <p className="text-gray-11 text-sm">
                <span className="font-medium text-gray-12">
                  Fixed Dimensions
                </span>
                {" — "}Form constrained to sidebar width. Scrolls if content
                exceeds height.{" "}
                <ViewCodeLink href={`/forms/${id}/custom-dimensions`} />
              </p>
              {[
                {
                  date: "Jan 10",
                  title: "New Community Center Opens",
                  text: "Our fifth location will serve 2,000+ families.",
                },
                {
                  date: "Jan 5",
                  title: "2025 Impact Report",
                  text: "15,000 individuals served, 500 scholarships awarded.",
                },
                {
                  date: "Dec 20",
                  title: "Holiday Drive Success",
                  text: "300 volunteers distributed meals to families.",
                },
              ].map((article) => (
                <article
                  key={article.title}
                  className="bg-panel rounded border p-5"
                >
                  <span className="text-xs text-gray-11">{article.date}</span>
                  <h3 className="font-semibold text-gray-12 mt-1">
                    {article.title}
                  </h3>
                  <p className="text-gray-11 text-sm mt-1">{article.text}</p>
                </article>
              ))}
            </div>

            <aside className="md:sticky md:top-20 self-start">
              <div className="bg-panel rounded border p-4">
                <h3 className="font-semibold text-gray-12 mb-3 text-center text-sm">
                  Quick Donate
                </h3>
                <iframe
                  title="donation form - sidebar widget"
                  src={`https://better.giving/forms/${id}`}
                  allow="payment"
                  width="100%"
                  height="450"
                  style={{ border: "none" }}
                />
              </div>
            </aside>
          </div>
        </div>
      </section>

      <footer className="px-6 py-8 bg-gray-12 text-background">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-background/70 text-sm">
            Demo page showcasing Better Giving embed styles
          </p>
          <Link
            to={`/forms/${id}/flexible-width`}
            className="inline-flex items-center gap-2 mt-3 text-demo-on-dark-faint hover:text-demo-on-dark-dim text-sm"
          >
            View all embed options
            <ExternalLink size={14} />
          </Link>
        </div>
      </footer>
    </main>
  );
}

function ViewCodeLink({ href, light }: { href: string; light?: boolean }) {
  return (
    <Link
      to={href}
      className={`inline-flex items-center gap-1 text-xs ${
        light
          ? "text-demo-on-dark-dim hover:text-white"
          : "text-demo hover:text-demo-dark"
      }`}
    >
      View code
      <ExternalLink size={10} />
    </Link>
  );
}
