# Donate (card)

## Sub-features
- Method tabs (Card, Bank Transfer, DAF, Stocks, IRA/QCD, Crypto), frequency, preset amounts, tip, fee cover.
- Donor info step (email, first/last name, employer).
- Payment step: donation summary + Stripe Payment Element / express checkout.

## How to get to it (user POV)
- Marketplace card → Donate. This flow does not click that link, so a pass does not verify it.
- `/donate/<npo id>`. The drive loads this directly. That is the entry a pass verifies.

## Driving it with drive.mjs
- `node scripts/drive.mjs donate-card` loads `/donate/<id>` directly (the seeded id from launch). It does not click Donate on the marketplace card. Then click **+100 USD** → **Continue with Card** → "Payment information" step; fill `email`, `first_name`, `last_name` → **Continue** → "Your donation summary", "Total donation $100.00".
- With filler keys: the page shows "We couldn't start the payment…" and `stripe-stub.log` lists the refused server calls (e.g. `GET /v1/customers/search`) → status **blocked**.
- With `VERIFY_STRIPE_SK`/`VERIFY_STRIPE_PK` test keys: also types 4242 4242 4242 4242 into the `Secure payment input frame` iframe → **pass**. It does not submit a charge.
- Proof: `donate-card-1-amount.png`, `-2-donor.png`, `-3-payment.png`, `-4-card.png` (test-key path only, after the card number is typed), each with a sibling `.aria.txt`, and `donate-card.log`.

## Gotchas
- Don't wait for networkidle; Stripe.js retries forever with filler keys.
- The footer Marketplace click prefetches `/donate/1` and Vite optimizes that route. The next direct load can 504 those dependencies and leave **+100 USD** disabled. The drive reloads the same `/donate/<id>` and clicks again. It does not switch to the marketplace-card entry.
- PayPal / express checkout "failed to load" banners are expected with filler keys.
