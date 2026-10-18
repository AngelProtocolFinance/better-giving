# Campaign page

## Sub-features
- Public campaign page outside the platform header: identity bar, hero, title, progress and goal, Share inside the progress panel, story, the campaign's donate box, supporter wall, Better Giving badge.
- `<head>` title, description, and hero image.
- `/org/<org>` redirects to the marketplace profile. A draft slug and an unknown slug are 404.

## How to get to it (user POV)
- `/org/<org-slug>/<campaign-slug>`. The drive loads this directly. That is the entry a pass verifies.
- `/org/<org-slug>` is a separate direct request. It is not a click.

## Driving it with drive.mjs
- `node scripts/drive.mjs campaign-page` loads `GET /org/verify-campaign/winter` and checks the hero image (`/logo.png`), the title **Winter Drive**, the story, **$0** raised of a **$5,000** goal, **+100 USD**, **Continue with Card**, **Share on LinkedIn**, the supporter message **Seeded campaign thanks**, and the footer badge. **Profile only gift note** is absent. There is no **Log In** link.
- `<head>` title is `Winter Drive - Better Giving`. The description meta contains the story. `og:image` contains `logo.png`.
- `GET /org/verify-campaign` is a 302 to `/marketplace/verify-campaign` (not followed).
- `GET /org/verify-campaign/draft-hidden` and `GET /org/verify-campaign/no-such-campaign` are 404.
- Proof: `campaign-page.png` and `campaign-page.aria.txt`.

## Gotchas
- The page has its own identity bar. The check for the platform header is the absence of **Log In**, not the absence of a header element.
- The supporter wall loads after the document. The drive waits on the message text.
