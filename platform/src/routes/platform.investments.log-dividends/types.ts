import type { IDividendLogFv as FV } from "@/nav/schemas";

export interface FormState {
  type: "form";
  fv?: FV;
  shares?: Record<string, number>;
}

export interface ReviewState {
  type: "review";
  fv: FV;
  per_npo_credit_usd: Record<string, number>;
}

export type State = FormState | ReviewState;
