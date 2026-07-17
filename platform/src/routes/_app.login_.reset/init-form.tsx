import { valibotResolver } from "@hookform/resolvers/valibot";
import { Mail } from "lucide-react";
import { href, Link, useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { Input } from "#/components/form";
import { email_schema, type IEmailSchema } from "./schema";

type Props = { to: string };

export function InitForm(props: Props) {
  const fetcher = useFetcher();
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useRemixForm<IEmailSchema>({
    fetcher,
    resolver: valibotResolver(email_schema),
  });

  return (
    <fetcher.Form
      method="POST"
      onSubmit={handleSubmit}
      className="grid w-full max-w-md px-6 sm:px-7 py-7 sm:py-8 bg-card border rounded"
    >
      <h3 className="text-center text-xl sm:text-2xl font-bold">
        Reset your Password
      </h3>
      <p className="mt-2 text-center max-sm:text-sm">
        Enter your registered email to reset password
      </p>

      <Input
        {...register("email")}
        placeholder="Email address"
        classes={{ container: "mt-6" }}
        icon={Mail}
        error={errors.email?.message}
      />

      <button
        disabled={fetcher.state !== "idle"}
        type="submit"
        className="mt-6 w-full h-12 sm:h-[52px] flex-center btn-primary rounded sm:text-lg font-bold"
      >
        {fetcher.state !== "idle" ? "Sending..." : "Send Code"}
      </button>

      <Link
        to={`${href("/login")}?redirect=${props.to}`}
        className="mt-5 text-primary hover:text-primary active:text-primary aria-disabled:text-muted-fg max-sm:text-sm font-medium underline text-center"
        aria-disabled={fetcher.state !== "idle"}
      >
        Back to Sign In
      </Link>
    </fetcher.Form>
  );
}
