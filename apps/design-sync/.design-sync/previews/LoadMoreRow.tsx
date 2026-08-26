import { LoadMoreRow, LoadMoreTr } from "@better-giving/ui";

// the foot of every paginated table in the product: one full-width "View
// More" that fetches the next page in place. it is a row, not a control
// floated under the table — the table keeps one edge and the button reads as
// the last line of it.
//
// the button's look comes from `.table`'s own `tfoot button` rule, not from
// classes on the component, so a preview must render it INSIDE a `.table`.
// dropped anywhere else it is an unstyled `<button>`.

const rows = [
  ["Mar 14, 2026", "Rainforest Trust", "$250.00"],
  ["Mar 12, 2026", "Ocean Conservancy", "$40.00"],
  ["Mar 09, 2026", "Doctors Without Borders", "$1,200.00"],
];

const Head = () => (
  <thead>
    <tr>
      <th>Date</th>
      <th>Nonprofit</th>
      <th>Amount</th>
    </tr>
  </thead>
);

const Body = () => (
  <tbody>
    {rows.map(([date, npo, amount]) => (
      <tr key={date}>
        <td>{date}</td>
        <td>{npo}</td>
        <td>{amount}</td>
      </tr>
    ))}
  </tbody>
);

// resting: there is another page, and the spinner slot is held open with
// `invisible` so the label does not shift when the fetch starts.
export const Default = () => (
  <table className="table w-96">
    <Head />
    <Body />
    <LoadMoreRow col_span={3} on_load_next={() => {}} />
  </table>
);

// mid-fetch. the label changes with the spinner, so the state is legible
// without relying on motion alone.
export const Loading = () => (
  <table className="table w-96">
    <Head />
    <Body />
    <LoadMoreRow col_span={3} loading on_load_next={() => {}} />
  </table>
);

// the last page. `disabled` is the caller's call — the component does not
// know how many pages there are — and the row stays rather than disappearing,
// so the table does not shorten under the pointer.
export const Disabled = () => (
  <table className="table w-96">
    <Head />
    <Body />
    <LoadMoreRow col_span={3} disabled on_load_next={() => {}} />
  </table>
);

// `LoadMoreTr` is the same row without the `<tfoot>` wrapper, for a table
// that already owns one — a foot that also carries a totals row, say. it must
// still land inside a `<tfoot>`: the styling rule is scoped to one.
export const InAnExistingFoot = () => (
  <table className="table w-96">
    <Head />
    <Body />
    <tfoot>
      <tr>
        <td colSpan={2} className="font-semibold">
          Total
        </td>
        <td className="font-semibold">$1,490.00</td>
      </tr>
      <LoadMoreTr col_span={3} on_load_next={() => {}} />
    </tfoot>
  </table>
);
