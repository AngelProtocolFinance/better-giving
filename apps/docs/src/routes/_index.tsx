import { ArrowRight, Code } from "lucide-react";
import { Link } from "react-router";
import { BG_FORM_ID } from "#/constants";

export default function Home() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-neutral-900 mb-3">
            Better Giving Developer Resources
          </h1>
        </div>

        {/* Feature Cards */}
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-5 rounded border border-neutral-200 bg-white max-w-md">
            <div className="p-3 rounded bg-blue-50 text-blue-600">
              <Code size={24} />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-neutral-900">Form Embedding</h2>
              <p className="text-sm text-neutral-500 mt-1">
                Discover cool ways to embed Better Giving donation forms
                seamlessly into your website.
              </p>
              <div className="flex flex-wrap gap-4 mt-3">
                <Link
                  to={`/forms/${BG_FORM_ID}/flexible-width`}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  See examples
                  <ArrowRight size={14} />
                </Link>
                <Link
                  to="/demo-nonprofit"
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View demo page
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
