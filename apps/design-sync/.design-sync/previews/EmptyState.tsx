import { Button, EmptyRow, EmptyState } from "@better-giving/ui";

// the default, and by far the most common: one line of muted text where the
// content would have been. no icon and no heading — an empty table is not a
// warning, and whoever came for the table did not come for a headline.
export const Default = () => <EmptyState>No donors yet</EmptyState>;

// `yet` and `found` are not interchangeable. `yet` says the collection has
// never held anything; `found` says a filter or a search came back empty and
// there may well be something behind it.
export const YetVersusFound = () => (
  <div className="grid gap-2">
    <EmptyState>No donations yet</EmptyState>
    <EmptyState>No settled donations found</EmptyState>
  </div>
);

// the full treatment, for a screen where there is a real next step. two of
// the product's empty states have one.
export const WithAction = () => (
  <EmptyState
    heading="No donations yet"
    action={<Button variant="primary">Browse nonprofits</Button>}
  >
    Pick a nonprofit and your first donation shows up here.
  </EmptyState>
);

// the table form. a `<td>` is the only child a `<tbody>` row may carry, so
// the block cannot be dropped in on its own — `EmptyRow` is the row.
export const InATable = () => (
  <table className="table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Nonprofit</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      <EmptyRow col_span={3}>No donations yet</EmptyRow>
    </tbody>
  </table>
);
