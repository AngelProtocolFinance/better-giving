---
category: Content
---

# EmptyState

What a screen shows where the content it was built around is not there — an unfiltered list with nothing in it, a filter that matched nothing, a table with no rows.

The default is one line of muted text and nothing else. There is no icon: an empty table is not a warning, and somebody who came to read the table does not need a symbol in front of the sentence telling them it is empty.

`heading` promotes it to a full treatment and `action` adds the next step, usually a `Button`. Both are off by default and most screens leave them off — the two are for the places where there is genuinely somewhere to go.

`classes` takes margin only. The component owns its vertical rhythm, and a second padding utility of equal specificity resolves by stylesheet order rather than class-string order, so a caller that adds one is not choosing a size.

## The wording rule

The line is `No … yet` or `No … found`, and the two say different things:

- **`yet`** — the collection has never held anything. "No donors yet."
- **`found`** — a filter or a search came back empty, and there may be plenty behind it. "No settled donations found."

Telling somebody who has never donated that no donations were *found* reads as a search that failed. Telling somebody who filtered to one status that they have nothing *yet* is simply untrue. Which of the two applies depends on whether a filter ran, so it is the screen's call — but it is always one of them.

## EmptyRow

The same block inside a table row. A `<td>` is the only child a `<tbody>` row may carry, so the block cannot be dropped into a table on its own; `col_span` is the table's column count and the cell spans all of it.
