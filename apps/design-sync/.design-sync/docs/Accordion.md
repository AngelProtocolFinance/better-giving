---
category: Content
---

# Accordion

A list of questions, each opening its answer below it: the FAQ list.

`items` are the rows: `trigger` is the question, `content` the answer. One row is open at a time, and clicking the open row closes it again. The look is closed: `variant="compact"` is a tight list with small type inside a card (the donate page's FAQ), `variant="divided"` is a padded list ruled between rows for a page section. The chevron and the open/close height animation come with it. `className` is for placement only; the heading above the list is the page's, and each question sits in a heading one level under it (`heading_level`, default 3, for a list under an h2).

Not for switching panels of one screen (that is `Tabs`).
