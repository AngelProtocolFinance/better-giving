import use_swr from "swr/immutable";
import type { WiseCurrency } from "#/types/bank-details";
import type { QueryState, WiseCurrencyOption } from "#/types/components";
import { json_ok } from "@/helpers/https";

async function get_currencies(path: string) {
  return fetch(path)
    .then((res) => json_ok<WiseCurrency[]>(res))
    .then((data) =>
      data.map<WiseCurrencyOption>((r) => ({
        rate: null,
        code: r.code,
        name: r.name,
      }))
    );
}

export function use_currencies(): QueryState<WiseCurrencyOption[]> {
  const { data, isLoading, isValidating, error } = use_swr(
    "/api/wise/v1/currencies",
    get_currencies
  );
  return {
    data,
    is_loading: isLoading,
    is_fetching: isValidating,
    is_error: !!error,
    error,
  };
}
