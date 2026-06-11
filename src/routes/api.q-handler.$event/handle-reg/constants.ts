import type { TReferralMethod, TRole } from "@/reg/schema";

export const ROLES: { [role in TRole]: string } = {
  president: "Chairperson/President",
  "vice-president": "Vice-Chair/President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  ceo: "CEO",
  cfo: "CFO",
  "board-member": "Board Member",
  "leadership-team": "Leadership Team",
  "fundraising-finance": "Fundraising",
  legal: "Legal",
  communications: "Communications",
  "executive-director": "Executive Director",
  other: "Other",
};

export const REFERRALS: { [method in TReferralMethod]: string } = {
  referral: "Others", //not used: formerly: "Referral Code"
  "better-giving-alliance": "Better.Giving website",
  discord: "Discord",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  press: "Press",
  "search-engines": "Search Engine",
  twitter: "Twitter",
  medium: "Others", //not used formerly: "Medium"
  other: "Others",
};
