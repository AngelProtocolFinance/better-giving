import type { IInterestLogFV as FV } from "@/liquid/schemas";

export {
  type IInterestLogFV as FV,
  interest_log as fv,
} from "@/liquid/schemas";

export interface FormState {
  type: "form";
  fv?: FV;
  shares?: Record<string, number>;
}

export interface ReviewState {
  type: "review";
  fv: FV;
  shares: Record<string, number>;
}

export type State = FormState | ReviewState;
