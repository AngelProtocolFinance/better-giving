import type { InferOutput } from "valibot";
import type { target } from "@/schemas";

type ITarget = InferOutput<typeof target>;

// table stores target as two XOR columns: target_number (numeric) + target_smart (boolean)
// domain uses single field: target: "smart" | string | undefined
export function to_target(
  target_number: number | null,
  target_smart: boolean | null
): ITarget | undefined {
  if (target_smart) return "smart";
  if (target_number != null) return target_number.toString();
  return undefined;
}

export function from_target(target: ITarget | undefined): {
  target_number: number | null;
  target_smart: boolean | null;
} {
  if (target === "smart") return { target_number: null, target_smart: true };
  if (target != null)
    return { target_number: Number(target), target_smart: null };
  return { target_number: null, target_smart: null };
}
