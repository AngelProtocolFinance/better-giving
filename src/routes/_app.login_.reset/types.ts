import * as v from "valibot";

export const initStep = v.object({
  type: v.literal("init"),
});

export interface InitStep extends v.InferOutput<typeof initStep> {}

export const setPasswordStep = v.object({
  type: v.literal("set-password"),
  email: v.pipe(v.string(), v.email()),
  token: v.optional(v.string()),
});

export interface SetPasswordStep
  extends v.InferOutput<typeof setPasswordStep> {}

export const successStep = v.object({
  type: v.literal("success"),
});

export interface SuccessStep extends v.InferOutput<typeof successStep> {}

export const expiredStep = v.object({
  type: v.literal("expired"),
  email: v.pipe(v.string(), v.email()),
});

export interface ExpiredStep extends v.InferOutput<typeof expiredStep> {}

export const migratedStep = v.object({
  type: v.literal("migrated"),
  email: v.pipe(v.string(), v.email()),
});

export interface MigratedStep extends v.InferOutput<typeof migratedStep> {}

export const step = v.fallback(
  v.variant("type", [
    initStep,
    setPasswordStep,
    successStep,
    expiredStep,
    migratedStep,
  ]),
  { type: "init" }
);

export interface LoaderData {
  redirect: string;
  step: v.InferOutput<typeof step>;
}
