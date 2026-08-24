import { MultiCombo } from "@better-giving/ui";
import { useSearchParams } from "react-router";
import { countries, country_names } from "#/constants/countries";
import { toParsed, toRaw } from "#/pages/marketplace/helpers";

export default function Countries() {
  const [params, set_params] = useSearchParams();
  const { countries: pcountries = [], ...p } = toParsed(params);

  return (
    <MultiCombo
      label="Countries"
      values={pcountries}
      on_change={(values) =>
        set_params(toRaw({ ...p, countries: values }), {
          replace: true,
          preventScrollReset: true,
        })
      }
      options={country_names}
      render={(c) => (
        <>
          <span className="text-2xl">{countries[c]?.flag}</span>
          <span>{c}</span>
        </>
      )}
      classes={{ label: "font-bold text-xs uppercase" }}
    />
  );
}
