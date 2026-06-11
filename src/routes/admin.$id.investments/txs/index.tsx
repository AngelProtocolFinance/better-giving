import { useSearchParams } from "react-router";
import { use_table } from "#/hooks/use-table";
import type { IBalanceTx } from "@/balance-txs";
import type { IPageKeyed } from "@/types/api";
import { Table } from "./table";

interface Props {
  page1: IPageKeyed<IBalanceTx>;
  classes?: string;
}

export function Txs({ classes = "", page1 }: Props) {
  const [search] = useSearchParams();
  const { node } = use_table({
    table: (x) => <Table {...x} />,
    page1: page1,
    gen_loader: (load, next) => () => {
      const p = new URLSearchParams(search);
      if (next) p.set("next", next);
      load(`?${p.toString()}`);
    },
  });
  return (
    <div className={`${classes} grid content-start`}>
      <h4 className="text-lg mb-2">Transactions</h4>
      {node}
    </div>
  );
}
