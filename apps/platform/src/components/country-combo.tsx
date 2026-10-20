import { Combo, type ComboProps, DrawerIcon } from "@better-giving/ui";
import { countries, country_names } from "@/constants/countries";

/**
 * what a caller still varies. `options`, `render`, `adornment` and
 * `adornment_side` are withheld, because a second spelling of any of them is a
 * second country picker. `placeholder` is a default instead, so a site wanting
 * a narrower prompt can still say so.
 */
type Props = Omit<
  ComboProps<string>,
  "options" | "render" | "adornment" | "adornment_side"
> & {
  /** flag emoji in each option and on the selected adornment. default on. */
  flags?: boolean;
};

/**
 * the country picker: the full `country_names` list. with `flags` (the
 * default) each option is a flag plus the name, and the start adornment is
 * the selected flag, falling back to the drawer chevron when nothing is
 * picked. with flags off, each option is the country name and the adornment
 * is that same chevron.
 *
 * the adornment reads `value` off props rather than closing over the caller's
 * field: the call sites hold their selection in different places (an RHF
 * controller, `useState`), so a closure over any one of them could not move.
 */
export function CountryCombo({
  placeholder = "Select a country",
  flags = true,
  ...p
}: Props) {
  return (
    <Combo<string>
      {...p}
      placeholder={placeholder}
      options={country_names}
      render={(c) =>
        flags ? (
          <>
            <span className="text-2xl">{countries[c].flag}</span>
            <span>{c}</span>
          </>
        ) : (
          c
        )
      }
      adornment_side="start"
      adornment={(open) => {
        const flag = flags && p.value ? countries[p.value]?.flag : undefined;
        return flag ? (
          <span className="text-2xl">{flag}</span>
        ) : (
          <DrawerIcon is_open={open} className="icon-xl" />
        );
      }}
    />
  );
}
