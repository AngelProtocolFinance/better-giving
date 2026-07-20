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
    color: "bg-green-100 text-green-600",
  },
  {
    icon: BookOpen,
    title: "Youth Education",
    description: "Provide educational resources and mentorship programs.",
    color: "bg-blue-100 text-blue-600",
  },
  {
    icon: Users,
    title: "Community Support",
    description: "Deliver essential services to families facing hardship.",
    color: "bg-purple-100 text-purple-600",
  },
];

export default function DemoNonprofitPage() {
  const id = BG_FORM_ID;
  const dialog_ref = useRef<HTMLDialogElement>(null);

  // replaces next/script <Script strategy="lazyOnload">. injecting in an effect
  // keeps it client-only (ssr-safe) and lazy — the script wires up the
  // data-bg-form containers on the page.
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
      {/* Navigation */}
      <nav className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-3 z-10">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-2 justify-center">
          {DEMO_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
            >
              {section.title}
            </a>
          ))}
        </div>
      </nav>

      {/* Flexible Width - Hero Section */}
      <section
        id="flexible-width"
        className="px-6 py-16 bg-linear-to-br from-blue-600 to-blue-800 scroll-mt-16"
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
              <p className="text-blue-100 mb-4">
                Join us in making a difference. Your support helps us deliver
                programs that transform lives across the region.
              </p>
              <p className="text-sm text-blue-200/80">
                <span className="font-medium text-blue-100">
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

      {/* With Border - White background section */}
      <section id="with-border" className="px-6 py-16 bg-white scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-neutral-900 mb-3">
              Support Our Mission
            </h2>
            <p className="text-neutral-500 text-sm max-w-lg mx-auto">
              <span className="font-medium text-neutral-700">With Border</span>
              {" — "}On white backgrounds, a subtle border separates the form
              from surrounding content.{" "}
              <ViewCodeLink href={`/forms/${id}/with-border`} />
            </p>
          </div>
          <div className="flex justify-center">
            <div
              data-bg-form={id}
              className="w-full max-w-150 rounded border border-neutral-200"
            />
          </div>
        </div>
      </section>

      {/* Donate Button - Program Cards */}
      <section
        id="donate-button"
        className="px-6 py-16 bg-neutral-50 scroll-mt-16"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-neutral-900 mb-3">
              Our Programs
            </h2>
            <p className="text-neutral-500 text-sm max-w-lg mx-auto">
              <span className="font-medium text-neutral-700">
                Donate Button
              </span>
              {" — "}Button click opens form in a modal. Great for CTAs without
              dedicating page space.{" "}
              <ViewCodeLink href={`/forms/${id}/donate-button`} />
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PROGRAMS.map((program) => (
              <div
                key={program.title}
                className="bg-white rounded border border-neutral-200 p-6 flex flex-col"
              >
                <div
                  className={`w-12 h-12 rounded flex items-center justify-center ${program.color} mb-4`}
                >
                  <program.icon size={24} />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                  {program.title}
                </h3>
                <p className="text-neutral-600 text-sm mb-6 flex-1">
                  {program.description}
                </p>
                <button
                  type="button"
                  onClick={() => dialog_ref.current?.showModal()}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition-colors text-sm"
                >
                  Donate
                </button>
              </div>
            ))}
          </div>

          {/* Donation Dialog */}
          <dialog
            ref={dialog_ref}
            className="p-0 rounded backdrop:bg-black/50 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0 max-h-[90vh] overflow-y-auto"
          >
            <div className="relative">
              <form method="dialog">
                <button
                  type="submit"
                  className="absolute right-2 top-2 z-10 p-1 rounded hover:bg-neutral-100 text-neutral-500"
                >
                  <X size={20} />
                </button>
              </form>
              <div data-bg-form={id} className="w-[90vw] max-w-150" />
            </div>
          </dialog>
        </div>
      </section>

      {/* With Content - Donation Appeal */}
      <section id="with-content" className="px-6 py-16 bg-white scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6 p-6 bg-blue-50 rounded border border-blue-100">
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                Help Us Reach $50,000
              </h2>
              <p className="text-neutral-600 text-sm mb-4">
                Expand our youth education program to three new communities.
              </p>
              <div className="bg-blue-100 rounded h-3 overflow-hidden mb-2">
                <div
                  className="bg-blue-600 h-full rounded"
                  style={{ width: "68%" }}
                />
              </div>
              <p className="text-xs text-neutral-500 mb-4">
                $34,000 raised of $50,000 goal
              </p>
              <p className="text-xs text-neutral-400">
                <span className="font-medium text-neutral-500">
                  With Content
                </span>
                {" — "}Wrap the form with headings, campaign progress, or
                context. <ViewCodeLink href={`/forms/${id}/with-content`} />
              </p>
            </div>
            <div
              data-bg-form={id}
              className="rounded border border-neutral-200"
            />
          </div>
        </div>
      </section>

      {/* Fixed Dimensions - Sidebar Widget */}
      <section
        id="fixed-dimensions"
        className="px-6 py-16 bg-neutral-50 scroll-mt-16"
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-[1fr_350px] gap-8">
            {/* Main content */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-neutral-900">
                Latest Updates
              </h2>
              <p className="text-neutral-500 text-sm">
                <span className="font-medium text-neutral-700">
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
                  className="bg-white rounded border border-neutral-200 p-5"
                >
                  <span className="text-xs text-neutral-500">
                    {article.date}
                  </span>
                  <h3 className="font-semibold text-neutral-900 mt-1">
                    {article.title}
                  </h3>
                  <p className="text-neutral-600 text-sm mt-1">
                    {article.text}
                  </p>
                </article>
              ))}
            </div>

            {/* Sidebar with fixed-dimension form */}
            <aside className="md:sticky md:top-20 self-start">
              <div className="bg-white rounded border border-neutral-200 p-4">
                <h3 className="font-semibold text-neutral-900 mb-3 text-center text-sm">
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

      {/* Footer */}
      <footer className="px-6 py-8 bg-neutral-900 text-white">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-neutral-400 text-sm">
            Demo page showcasing Better Giving embed styles
          </p>
          <Link
            to={`/forms/${id}/flexible-width`}
            className="inline-flex items-center gap-2 mt-3 text-blue-400 hover:text-blue-300 text-sm"
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
          ? "text-blue-200 hover:text-white"
          : "text-blue-600 hover:text-blue-800"
      }`}
    >
      View code
      <ExternalLink size={10} />
    </Link>
  );
}
