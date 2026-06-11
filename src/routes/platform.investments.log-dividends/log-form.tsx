import { valibotResolver } from "@hookform/resolvers/valibot";
import { useForm } from "react-hook-form";
import { href } from "react-router";
import { Field, Form, toYYYMMDD } from "#/components/form";
import type { IDividendSimulComps } from "@/nav";
import { dividend_log_fv, type IDividendLogFv as FV } from "@/nav/schemas";

interface Props {
  classes?: string;
  init?: FV;
  on_submit: (fv: FV, per_npo_credit_usd: Record<string, number>) => void;
}

export function LogForm({ classes = "", on_submit, init }: Props) {
  const now = new Date();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FV>({
    resolver: valibotResolver(dividend_log_fv),
    defaultValues: {
      date: init?.date ? toYYYMMDD(new Date(init.date)) : toYYYMMDD(now),
      ticker: init?.ticker || "",
      total: init?.total || "",
    },
  });

  const submit = async (x: FV) => {
    const res = await fetch(href("/api/npos/dividend-log-simul"), {
      method: "POST",
      body: JSON.stringify(x),
    });
    if (!res.ok) throw res;
    const { per_npo_usd }: IDividendSimulComps = await res.json();
    on_submit(x, per_npo_usd);
  };

  return (
    <Form
      disabled={isSubmitting}
      id="log-interest-form"
      onSubmit={handleSubmit(submit, console.error)}
      className={`${classes} grid p-4`}
    >
      <Field
        {...register("date")}
        label="Date"
        type="date"
        error={errors.date?.message}
        classes={{ container: "mb-4", label: "" }}
      />
      <Field
        {...register("ticker")}
        sub="e.g. `qqqm`, `ivv`, or just use `cash` if basket of tickers"
        label="Ticker source"
        error={errors.ticker?.message}
        classes={{ container: "mb-4", label: "" }}
      />
      <Field
        {...register("total")}
        label="Amount ($)"
        error={errors.total?.message}
        classes={{ container: "mb-4", label: "" }}
      />
    </Form>
  );
}
