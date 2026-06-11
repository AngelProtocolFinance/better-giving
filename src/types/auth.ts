import * as v from "valibot";
import { $req } from "@/schemas";
import { person_name } from "@/schemas/person-name";
import type { INpoBookmark, IUserNpo2 } from "./user";

export type { AuthUser } from "#/.server/auth";

export interface AuthError<T extends string = string> {
  __type: T | (string & {});
  message: string;
}

export const is_error = (data: any): data is AuthError => {
  return !!data.__type;
};

export type PublicUser = {
  avatar_url?: string;
  is_admin: boolean;
  bookmarks: INpoBookmark[];
  orgs: IUserNpo2[];
};

const email = v.pipe($req, v.toLowerCase(), v.email("invalid email format"));
export const sign_in = v.object({
  email,
  password: v.pipe(v.string("required"), v.nonEmpty("required")),
});

export type ISignIn = v.InferOutput<typeof sign_in>;

const new_password = v.pipe(
  v.string("required"),
  v.nonEmpty("required"),
  v.minLength(8, "must have at least 8 characters"),
  v.regex(/[a-z]/, "must have lowercase letters"),
  v.regex(/[A-Z]/, "must have uppercase letters"),
  v.regex(/\d/, "must have numbers"),
  v.regex(/[!@#$%^&*()_+{}[\]:;<>,.?~\\/-]/, "must have special characters")
);

export const sign_up = v.pipe(
  v.object({
    email,
    email_confirmation: email,
    first_name: person_name,
    last_name: person_name,
    password: new_password,
    middle_name: v.optional(v.string()), // honeypot field - should remain empty
  }),
  v.forward(
    v.partialCheck(
      [["email"], ["email_confirmation"]],
      (input) => {
        return (
          input.email.toLowerCase() === input.email_confirmation.toLowerCase()
        );
      },

      "email mismatch"
    ),
    ["email_confirmation"]
  )
);

export const signup_confirm = v.object({ code: $req });
export type ISignUpConfirm = v.InferOutput<typeof signup_confirm>;
export type ISignUp = v.InferOutput<typeof sign_up>;
