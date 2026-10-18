# Campaign admin

## Sub-features
- Sidebar Campaigns, pinned Better Giving profile card, create and publish, the existing npo-owned listing on the same list, a QR code for the new campaign's public URL.
- Screenshot pass on the donor dashboard, the campaigns list, and `/fundraisers/<id>`. None of those screens shows the word fundraiser.

## How to get to it (user POV)
- Sign in, open the organization from My Organizations, then click sidebar Campaigns. That click is the entry a pass verifies.
- Edit Profile is the pinned card, not a direct load.
- New campaign is the button on the campaigns list.

## Driving it with drive.mjs
- `node scripts/drive.mjs campaign-admin` signs in as the seeded npo admin (`verify-admin@example.com`), clicks **Verify Campaign Nonprofit**, clicks sidebar **Campaigns**.
- The first card is **Better Giving profile**. Clicking it opens **Public profile information**.
- **New campaign**: name, address, story, a hero image (the blob stub stores it as `/logo.png`), a fixed goal, an end date, the Card method, and a 100 increment. **Publish**. The editor shows a Campaign QR. The drive turns the center logo off, screenshots the code, and decodes it with `zbarimg`. The decoded URL is `/org/verify-campaign/<slug>`.
- Back on the list, the new row is `live` with `$0` raised, and **Harbor Listing** (the seeded fund) is on the same list. The word fundraiser is absent.
- Direct loads, for the screenshot pass only: `GET /dashboard` and `GET /fundraisers/<seeded fund id>`. Neither shows fundraiser.
- Proof: `campaign-admin-*.png` with sibling `.aria.txt`, plus `campaign-admin-qr-code.png` (the decoded image).

## Gotchas
- Hero upload uses the blob stub (`blob-stub.mjs`) while `BLOB_READ_WRITE_TOKEN` is filler. A real token is not stubbed.
- The Campaigns sidebar link is `pointer-events-none` while a campaign editor is open, because the list route stays active. The drive goes back to the list instead of clicking it again.
- `zbarimg` has to be on `PATH` to decode the QR.
