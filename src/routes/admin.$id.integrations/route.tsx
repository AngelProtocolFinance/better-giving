import type { Route } from "./+types/route";
import { Display } from "./display";
import { Form } from "./form";

export { action, loader } from "./api";

export default function Page({ loaderData: { apiKey } }: Route.ComponentProps) {
  return (
    <div className="grid content-start px-6 py-4 md:px-10 md:py-8">
      <h3 className="text-3xl mb-2">Integrations</h3>
      <div className="mb-4 bg-card rounded p-4">
        <h4 className="text-xl font-semibold mb-2 text-[#FF4F00]">Zapier</h4>
        <p className="text-sm mb-4">
          API key to use with Better Giving Zapier Integration
        </p>
        {apiKey ? <Display apiKey={apiKey} /> : <Form />}
      </div>
    </div>
  );
}
