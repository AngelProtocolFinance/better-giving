import type {
  EndowmentAllocationUpdate,
  EndowmentProfileUpdate,
  EndowmentSettingsUpdate,
} from "#/types/npo";

export type EndowmentUpdate = Partial<
  EndowmentProfileUpdate & EndowmentSettingsUpdate & EndowmentAllocationUpdate
>;
