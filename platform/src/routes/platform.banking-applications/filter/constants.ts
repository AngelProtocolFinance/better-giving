import type { TStatus } from "@/banking";

export const statuses: Record<Exclude<TStatus, "default"> | "", string> = {
  "": "All",
  "under-review": "Under Review",
  approved: "Approved",
  rejected: "Rejected",
};
