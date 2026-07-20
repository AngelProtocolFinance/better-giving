import { ExternalLink } from "lucide-react";

const PLATFORM_GUIDES = [
  {
    name: "WordPress",
    url: "https://wordpress.org/documentation/article/custom-html/",
  },
  {
    name: "Wix",
    url: "https://support.wix.com/en/article/wix-editor-using-iframes-to-display-visible-content-on-your-site",
  },
  {
    name: "Squarespace",
    url: "https://support.squarespace.com/hc/en-us/articles/206543167-Code-blocks",
  },
  {
    name: "Webflow",
    url: "https://university.webflow.com/lesson/custom-code-embed",
  },
  {
    name: "Weebly",
    url: "https://www.weebly.com/app/help/us/en/topics/create-widgets-embed-code-and-add-external-content",
  },
  {
    name: "Shopify",
    url: "https://help.shopify.com/en/manual/online-sales-channels/buy-button/add-embed-code",
  },
  {
    name: "GoDaddy",
    url: "https://www.godaddy.com/help/add-html-or-custom-code-to-my-site-27252",
  },
  {
    name: "Blogger",
    url: "https://support.google.com/blogger/answer/176245",
  },
  {
    name: "Ghost",
    url: "https://ghost.org/tutorials/use-code-injection-in-ghost/",
  },
  {
    name: "HubSpot",
    url: "https://knowledge.hubspot.com/website-pages/embed-content-using-an-embed-code",
  },
];

export function PlatformGuide() {
  return (
    <div className="pt-6">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">
        How to embed on your platform
      </h3>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {PLATFORM_GUIDES.map(({ name, url }) => (
          <a
            key={name}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            {name}
            <ExternalLink size={12} className="text-neutral-400" />
          </a>
        ))}
      </div>
    </div>
  );
}
