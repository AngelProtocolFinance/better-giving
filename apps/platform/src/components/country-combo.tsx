import { Combo, type ComboProps, DrawerIcon } from "@better-giving/ui";
import { countries, country_names } from "#/constants/countries";

/**
 * what a caller still varies. `options`, `render`, `adornment` and
 * `adornment_side` are withheld, because a second spelling of any of them is a
 * second country picker. `placeholder` is a default instead, so a site wanting
 * a narrower prompt can still say so.
 */
type Props = Omit<
  ComboProps<string>,
  "options" | "render" | "adornment" | "adornment_side"
>;

/**
 * the country picker, in one spelling: the full `country_names` list, a
 * flag + name option row, and a start adornment showing the selected flag
 * that falls back to the drawer chevron when nothing is picked.
 *
 * the adornment reads `value` off props rather than closing over the caller's
 * field: the call sites hold their selection in different places (an RHF
 * controller, `useState`), so a closure over any one of them could not move.
 */
export function CountryCombo({
  placeholder = "Select a country",
  ...p
}: Props) {
  return (
    <Combo<string>
      {...p}
      placeholder={placeholder}
      options={country_names}
      render={(c) => (
        <>
          <span className="text-2xl">{countries[c].flag}</span>
          <span>{c}</span>
        </>
      )}
      adornment_side="start"
      adornment={(open) => {
        const flag = p.value ? countries[p.value]?.flag : undefined;
        return flag ? (
          <span className="text-2xl">{flag}</span>
        ) : (
          <DrawerIcon is_open={open} size={20} />
        );
      }}
    />
  );
}
