# Org profile page: design spec

The PM's standing decisions and feedback for the public org page (`/org/:org`), in one place. Build to this; a case it doesn't cover goes back to the PM as a named gap.

- **Mockups**: the original layout board (Poster, Letter, Hub, Feature, Card) and the hero-first canvas https://claude.ai/artifact/Kn38XyP4hzoRTuSm1JqZuv (Poster, Hub, Feature at 1440; Poster, Hub at 390).
- **Tokens**: `packages/brand/design-system.md` and `packages/ui/src/styles/`. Closed set, no raw palette names, one radius.

## Layouts

Picked per org by shape (`lib/org-shape.ts`):

| Layout | When |
| --- | --- |
| Poster | short story or none, 0–3 things to give to |
| Letter | long story, 0–3 |
| Hub | short or no story, 4+ |
| Feature | long story, 4+ |
| Card | no story, nothing listed |

Every list renders by its own count: 1 is a feature card, 2 are halves, 3 are thirds, and 4+ take the layout's navigation (swipe row, tabs with "Show more", or "See all N"). Programs are full-width rows at any count. A list never leaves an empty slot.

## Images

- Banners and every card image show at exactly **4:1, never cropped again**. Logos show whole in a square frame, or as a monogram when there is no logo.
- **The banner never takes the hero's space.** On Poster, Hub and Feature it is the 4:1 header of the give card beside the hero, above the figures and Donate. With no banner, the card starts at the figures. Letter keeps its banner between the page margins under the hero. Card keeps it as the top of its card.
- In a row or a side-by-side card, the image is an **inset thumbnail** centred against the text. It never sits stuck to an edge above an empty panel. Phones put the image across the top of the card.

## Hero

- The org's name, tagline, figures and Donate come first. **Donate is inside the first screen** at every width; on a phone the give card follows the tagline.
- The **facts row** (designation, country, website, registration) sits **above the name**. It never goes between the tagline and the story. Each fact has its icon: heart on the designation pill, map pin, globe, check badge.
- Name: `hero-heading` on Poster and Letter. A long name steps one size down at every width.
- Figures (raised, donors, goal lines, card progress) use `figures`. Nothing raised yet reads "Be the first to give".
- Feature: the give card stays on screen while the story scrolls. There is no separate hero Donate.

## Cards and lists

- The kind label ("Campaign", "Supporter campaign", "Program") shows **only when a list mixes kinds**. Videos count as a kind.
- "Ends in N days" is muted text with a clock icon. It never competes with the title.
- Section headings share one size across every layout.
- Letter shows donor words as a **pull-quote**: a blue rule on the left, no fill. Other layouts use the tinted strip.

## Header

- Share and Save sit close together, about 20px between the icons, and each keeps its 44px tap target.
- The header's Donate appears only once the hero's Donate has scrolled out of view.

## Motion

Use the design system's speeds and curves only. Reduced motion turns off the zoom, nudges and smooth scroll.

- Card hover (pointer only): the edge firms a step, the image zooms slightly inside its frame, and the row arrow nudges. A press moves the card down 1px.
- The header's Donate fades and slides in and out.
- The heart grows in on save. Unsaving only changes the colour.
- The next donor message fades in.
- Revealed cards fade in with a short, capped stagger.
- The story opens smoothly and snaps shut.
- Section links scroll smoothly.

## Code

- Keep comments short. Don't over-explain.

## Open

1. The design system has no hover rung for a card edge (the next grey up is used for now), no stagger token and no bounce keyframe.
2. The tab count is not muted yet ("Campaigns **4**"), because that change belongs to the shared Tabs component.
3. Feature at phone width on the hero-first canvas is not drawn. It follows Poster's phone order.
