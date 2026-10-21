import type { IPaginator } from "#/types/components";
import type { INpoDonation } from "$/pg/queries/dist";
import { to_row } from "./helpers";
import { Table } from "./table";

interface Props extends IPaginator<INpoDonation> {}

export function DonationsTable({ classes = "", items, ...props }: Props) {
  return (
    <div className={classes}>
      <div className="table-scroll">
        <Table {...props} items={items.map(to_row)} />
      </div>
    </div>
  );
}
