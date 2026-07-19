import type { FieldErrors, FieldValues } from "react-hook-form";

/** based on ReturnData (not exported from react-hook-form) */
export interface IFormInvalid<T extends FieldValues = Record<string, unknown>> {
  errors: FieldErrors<T>;
  receivedValues: Partial<T>;
}
