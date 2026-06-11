export type ResourceType = "templates" | "guides" | "whitepapers";

export const RESOURCE_TYPES: ResourceType[] = [
  "templates",
  "guides",
  "whitepapers",
];

export interface Resource {
  type: ResourceType;
  name: string;
  description: string;
  url: string;
  size?: string;
}

export const TYPE_LABELS: Record<ResourceType, string> = {
  templates: "Templates",
  guides: "Guides",
  whitepapers: "Whitepapers",
};

const S3 = "https://cnfc6hjkztdschkg.public.blob.vercel-storage.com/resources";

export const resources: Resource[] = [
  // templates
  {
    type: "templates",
    name: "Giving Tuesday Donor Email Template",
    description:
      "Ready-to-send email template for Giving Tuesday campaigns, with customizable sections for your nonprofit's story and donation ask.",
    url: `${S3}/giving-tuesday-donor-email-template.pdf`,
    size: "133 KB",
  },
  {
    type: "templates",
    name: "Marketplace Page Description Template",
    description:
      "Fill-in-the-blank template for writing a compelling nonprofit description on the Better Giving marketplace.",
    url: `${S3}/marketplace-page-description-template.pdf`,
    size: "133 KB",
  },
  {
    type: "templates",
    name: "Partnership Email Template",
    description:
      "Email template for announcing your nonprofit's partnership with Better Giving to donors and stakeholders.",
    url: `${S3}/partnership-email-template.pdf`,
    size: "5.3 MB",
  },
  {
    type: "templates",
    name: "Press Release Template",
    description:
      "Press release template for nonprofits announcing their Better Giving partnership to media outlets.",
    url: `${S3}/press-release-template.pdf`,
    size: "134 KB",
  },
  {
    type: "templates",
    name: "Social Media Partnership Announcement",
    description:
      "Social media post templates for announcing your nonprofit's partnership with Better Giving across platforms.",
    url: `${S3}/social-media-partnership-announcement-template.pdf`,
    size: "5.3 MB",
  },
  {
    type: "templates",
    name: "Fundraiser Info Templates",
    description:
      "Collection of templates for creating fundraiser information pages, donor communications, and campaign materials.",
    url: `${S3}/fundraiser-info-templates.pdf`,
    size: "6.0 MB",
  },
  // guides
  {
    type: "guides",
    name: "AI Fundraiser Campaign Guide (Experienced)",
    description:
      "How to use AI to create a fundraiser communications campaign — for nonprofits with some AI experience.",
    url: `${S3}/ai-fundraiser-campaign-guide-experienced.pdf`,
    size: "1.9 MB",
  },
  {
    type: "guides",
    name: "AI Fundraiser Campaign Guide (Beginners)",
    description:
      "Step-by-step guide to using AI for fundraiser communications — designed for nonprofits new to AI.",
    url: `${S3}/ai-fundraiser-campaign-guide-beginners.pdf`,
    size: "1.7 MB",
  },
  {
    type: "guides",
    name: "Nonprofit Support & Marketing Guide",
    description:
      "Comprehensive guide covering nonprofit support resources, marketing strategies, and promotional best practices.",
    url: `${S3}/nonprofit-support-marketing-guide.pdf`,
    size: "24.5 MB",
  },
  // whitepapers
  {
    type: "whitepapers",
    name: "The Power of Better Giving for Trustees",
    description:
      "Strategic presentation for trustees and board members on how Better Giving enables sustainable fundraising.",
    url: `${S3}/power-of-better-giving-trustees.pdf`,
    size: "5.9 MB",
  },
];
