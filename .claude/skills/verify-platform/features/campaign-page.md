# Campaign page

## Sub-features
- Public campaign page outside the platform header: identity bar, hero, title, progress and goal, story, the seeded YouTube video, supporter wall, Better Giving badge. Donate and Share are buttons. Donate opens the shared form. Share opens the network buttons.
- `<head>` title, description, and hero image.
- `/org/<org>` redirects to the marketplace profile. A draft slug and an unknown slug are 404.

## How to get to it (user POV)
- `/org/<org-slug>/<campaign-slug>`. The drive loads this directly. That is the entry a pass verifies.
- `/org/<org-slug>` is a separate direct request. It is not a click.

## Driving it with drive.mjs
- `node scripts/drive.mjs campaign-page` loads `GET /org/verify-campaign/winter` and checks the hero image (`img.aspect-video`, `/logo.png`), the title **Winter Drive**, the story, a **Videos** heading, the embed titled **Play video** for `aqz-KE-bpKQ`, **$25** raised of a **$5,000** goal, the supporter message **Seeded campaign thanks**, and the footer badge. **Profile only gift note** is absent. There is no **Log In** link. The body does not contain **About this campaign** or **Spread the word!**. **+100 USD**, **Continue with Card**, and **Share on LinkedIn** are absent until their dialogs open.
- It clicks **Donate** and then sees **Continue with Card**. It closes that dialog, clicks **Share**, and then sees **Share on LinkedIn**.
- `<head>` title is `Winter Drive - Better Giving`. The description meta contains the story. `og:image` contains `logo.png`.
- `GET /org/verify-campaign` is a 302 to `/marketplace/verify-campaign` (not followed).
- `GET /org/verify-campaign/draft-hidden` and `GET /org/verify-campaign/no-such-campaign` are 404.
- Proof: `campaign-page.png` (dialogs closed), `campaign-page-donate.png`, and `campaign-page-share.png`, each with a sibling `.aria.txt`.

## Gotchas
- The page has its own identity bar. The check for the platform header is the absence of **Log In**, not the absence of a header element.
- The supporter wall loads after the document. The drive waits on the message text.
- The video frame does not request the embed until the slot is in view. The drive scrolls it into view, then waits for `aqz-KE-bpKQ` on the iframe `src`. The iframe title is **Play video**.
- The hero is an `img` with class `aspect-video`. It has no `data-block="hero"`.
- A second Donate and Share mount in the sticky bar once the inline Donate leaves the viewport. The drive clicks the first of each.
- The donate dialog covers Share. The drive closes it before the Share click.
