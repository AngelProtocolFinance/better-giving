# Org profile: shape-driven layouts

## Change
The public org page (`/org/<slug>`) picks one of four layouts (Poster, Letter, Hub, Feature), each with a phone counterpart, from how much space its content takes. Donate is the most visible thing on every one of them.

## Why now
The current two-column page assumes every org has a long story and plenty of campaigns. Most don't: about 84% of published orgs on staging have nothing for the right column, 22% have no banner, and banners were re-cropped from 4:1 to 16:9. This branch (`org-profile-polish`, pushed) fixed the worst of it; this effort replaces the layout itself.

Design: claude.ai canvas "Org profile layouts" (https://claude.ai/artifact/4E9dzbFjnbHv6QoxoWkZvb), page **Shape-driven layouts**. Boards: How the shape is measured, Poster, Letter, Hub, Feature, the four phone versions, Hero, Lists by count, What the data allows. The "First pass" page is superseded.

## Blast radius
- `apps/platform/src/routes/org.$org._index/`: `api.ts` (loader), `route.tsx`, `profile.tsx` (rewritten into layout components), tests.
- `apps/platform/src/components/org-page/`: header (Donate on scroll, heart), footer (unchanged).
- `apps/platform/.server/pg/queries/`: `campaign.ts` (member campaigns, ends_at), `program.ts` (target_raise, total_donations), `donation-message.ts` (cursor tie-break), `npo.ts` (published gate).
- `apps/platform/src/routes/_app.marketplace_.$id/route.ts` (slug lookup before redirect), `org.$org.$campaign/page.tsx` (designation tag token), `_app.wp-plugin/route.tsx` (copy), `components/bookmark-btn.tsx`.
- New: a profile-shape module (measures, threshold rules, Jev call) under `apps/platform/lib/` or `.server/`.
- New one-off job: re-crop legacy non-square logos (`apps/platform/jobs/`, run with bun).
- Risk: highest-traffic public page; Jev is an external dependency on it, so it has a timeout and a threshold fallback. No migration.

## Landing plan
- [ ] PR 1: `org-profile-polish` → main (one environment, no migration)
  - [x] Polish: About-led 3:1, two-stat raised, 4:1 banner, share chooser, header icons (pushed)
  - [ ] Spike: one Jev call through AI Gateway (SDK or direct HTTP), with timeout and fallback, behind a unit test
  - [ ] Bug fixes: 4:1 campaign/fundraiser card images; donor-message cursor tie-break; heart works logged out and announces its saved state; slug URLs canonicalise case, and an unknown `/marketplace/<slug>` resolves before redirecting; designation tag text token on the campaign page; WordPress plugin page copy
  - [ ] Data: member campaigns ("with [owner org]"); stop dropping campaigns of slugless owners; unpublished orgs 404 for visitors and render for their own admins; campaign `ends_at`; program goal and raised
  - [ ] Shape: measures (story length, item count per kind, banner and logo present, name length), threshold rules, Jev decides the layout with the thresholds as fallback
  - [ ] Shared parts: hero (4:1 strip / brand band, logo / monogram, name sizing), list-by-count renderer, Donate (header on scroll, pinned bar on phones), raised stats with "Be the first to give"
  - [ ] Layouts: Poster, Letter, Hub, Feature, each with phone
  - [ ] Remove the old layout code and its tests; delete this brief's in-repo copy
- [ ] Job: re-crop legacy non-square logos (run on staging; production run is the PM's)
- [ ] Job: layout review list — each published org with its measures, the threshold layout, Jev's layout and its page link; Jev/threshold disagreements first (run on staging; production run is the PM's)

## Decisions resolved
- Scope → all four layouts plus phone versions, one effort. They share the hero, list cards and Donate bar.
- Layout inputs → size, not "real vs placeholder": story length, item count, banner/logo present, name length. (PM, canvas comment)
- Banner → always 4:1, matching the upload crop; no banner means a brand-blue band. Logo → 1:1 or monogram. (PM)
- Story → short ≤ ~320 characters (fits the hero), long beyond; "Read the full story" past ~1,200 in Feature.
- Items → 0–3 is one row; 4+ needs navigation (tabs in Hub, swipeable rows in Feature).
- List by count → 1 = full-width feature card; 2 = halves; 3 = thirds; 4+ = the layout's navigation. Programs are always rows. Videos: 1 full, 2 halves, 3–4 one large plus small. A Hub kind with 1 item sits above the tabs as "Featured".
- Donate → a filled primary button visible on first load in every layout; in the header once the hero scrolls away on desktop; a pinned bottom bar on phones. (PM)
- Donor messages never change the layout: quote strip in Poster/Letter, a tab in Hub/Feature.
- Who decides → Jev from day 1 (PM). Our call on mechanics: Jev runs at page render from the measures, under the page's existing CDN cache (`s-maxage=60`), with a short timeout; on timeout or error the threshold rules decide. This keeps time-based changes (a fundraiser closing on its date) correct with no stored layout and no migration.
- Jev facts → AI Gateway model `typesafe-ai/jev` (pin a version, e.g. `typesafe-ai/jev-1.14.0`). The gateway lists it as type "evaluation", spec "v4", text in only: it takes shared state plus typed questions and returns choices with scores, not chat text; 32k-token context. The repo's `ai` SDK is 6.0.176 and may not speak spec v4, so the spike tries the SDK first and falls back to a direct gateway HTTP call. Auth is the existing `AI_GATEWAY_API_KEY` (same key `_app.fundraisers.new/evaluate.ts` uses).
- Jev input → the measures only (story character count, item count per kind, banner/logo present, name length), never the org's text; question → which of Poster / Letter / Hub / Feature.
- When → on each render, not stored. Stored layouts go stale when fundraisers close by date.
- Unused data in → campaign end date ("Ends in N days"), program goal/raised bars. Later → milestones timeline, SDG chips, fiscal-sponsor note. Never → donor message amounts (privacy).
- Member campaigns → shown, labelled "with [owner org]".
- Unpublished orgs → 404 for visitors, visible to their own admins.
- Existing orgs → no prefill; the layout is computed on render. A one-off review list (measures, threshold pick, Jev pick, link; disagreements first) lets the PM check orgs individually before launch. (PM)
- Manual per-org layout override → not now: needs a stored column, and a pinned layout can strand an org whose content changes. (PM)
- Legacy non-square logos → auto-crop to the centre square once; orgs can replace.
- Live profile issues pulled in → donor-message pagination skip, logged-out heart, slug case + marketplace redirect, campaign designation tag color, WordPress plugin copy.
- Delivery → the build runs in Claude on the web, so a copy of this brief rides in the branch at `apps/platform/BRIEF-org-profile-layouts.md` and is deleted by the last commit. (PM)

## Non-goals
- Milestones, SDGs, fiscal-sponsor note, donor message amounts.
- The admin media page and the "featured" video flag.
- A manual per-org layout override.
- The other 23 filed issues.
- Marketplace cards, campaign and program pages beyond the named fixes.

## Done when
- [ ] Each of the four layouts renders for its shape at 1440 and 375, matching the canvas boards.
- [ ] Donate is visible on first load in every layout; pinned on phones; in the header after scrolling on desktop.
- [ ] Jev picks the layout; with Jev timing out or failing, the threshold rules pick it and the page still renders within its normal time.
- [ ] Lists follow the count rules (1/2/3/4+) in every layout; no empty slots, no navigation for one item.
- [ ] Banners and all card images show at 4:1 with no second crop; no banner gives the brand band; no logo gives a monogram.
- [ ] $0 raised shows "Be the first to give"; a goal shows the bar.
- [ ] Member campaigns show with their owner; campaigns of slugless owners show; unpublished orgs 404 for visitors only.
- [ ] Campaign cards show "Ends in N days" when an end date is set; programs show goal progress when set.
- [ ] The five pulled-in issues are fixed and their files closed.
- [ ] Legacy logos re-cropped on staging.
- [ ] Layout review list produced on staging, disagreements first.
- [ ] CI green; old layout code removed.

## Open questions
1. No team seat owns the AI Gateway / `ai` SDK code the Jev call needs. Recommend building that one small call without a specialist (Context7 docs for the SDK, a direct gateway request if the SDK can't speak Jev's spec), since it's a single function with a fallback.
