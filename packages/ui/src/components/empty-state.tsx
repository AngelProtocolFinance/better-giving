import type { ReactNode } from "react";

interface IShared {
  /** the one line. the wording rule is `… yet` for a collection that has
   *  never held anything and `… found` for a filter or a search that came
   *  back empty — they say different things to the person reading, and a
   *  filtered table telling someone they have no donations is wrong rather
   *  than terse. the sweep pins the shape; which of the two is true is the
   *  call site's to know. */
  children: ReactNode;
  /** promotes the block to a full treatment. most screens leave it off — an
   *  admin who came for the table does not want a headline in front of it. */
  heading?: string;
  /** the next step, where there genuinely is one. two of the product's
   *  empty states have one; the rest are tables that could not carry it. */
  action?: ReactNode;
  /** the vertical rhythm belongs to the component, so no `py-*`/`p-*` here —
   *  two utilities of equal specificity resolve by stylesheet order, not by
   *  class-string order, so a second one is a coin flip. margin is the
   *  caller's, as everywhere else. */
  classes?: string;
}

export function EmptyState({
  heading,
  action,
  classes = "",
  children,
}: IShared) {
  return (
    <div className={`py-8 text-center text-muted-fg ${classes}`}>
      {heading && <h3 className="text-lg text-fg">{heading}</h3>}
      <p className={heading ? "mt-1" : ""}>{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

interface IRow extends IShared {
  col_span: number;
}

/** the table form. a `<td>` is the only child a `<tbody>` row may carry, so
 *  the block cannot simply be dropped in — and the 19 hand-rolled copies of
 *  this row had drifted to two class orders and three rhythms. */
export function EmptyRow({ col_span, ...rest }: IRow) {
  return (
    <tr>
      {/* override .table td padding: the state owns its own rhythm */}
      <td colSpan={col_span} className="p-0">
        <EmptyState {...rest} />
      </td>
    </tr>
  );
}
