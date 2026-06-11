import { Search } from "lucide-react";
import type { ChangeEvent } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { use_debounce } from "#/hooks/use-debounce";

interface Props {
  onChange: (text: string) => void;
  classes?: string;
}
export default function SearchField({ classes = "", onChange }: Props) {
  const [params] = useSearchParams();
  const { load } = useFetcher({ key: "home" });

  function handleChange(ev: ChangeEvent<HTMLInputElement>) {
    const val = ev.target.value;
    onChange(val);
    const n = new URLSearchParams(params);
    n.set("query", val);
    load(`?index&${n.toString()}`);
  }

  const debounced_change = use_debounce(handleChange, 500);

  return (
    <div className={`${classes} flex items-center px-4 py-1 text-sm gap-1 `}>
      <label htmlFor="__endow-search">
        <Search className="mr-1 text-muted-fg" />
      </label>
      <input
        onChange={debounced_change}
        id="__endow-search"
        type="text"
        placeholder="Search causes..."
        className="focus:outline-hidden text-lg placeholder:text-muted-fg text-muted-fg autofill:bg-background"
      />
    </div>
  );
}
