# Campaign donate

## Sub-features
- The campaign page's donate box: preset amount, card, donor info, payment summary.
- The donation intent carries the campaign id.
- `?amount=` and `?frequency=` preset the box.

## How to get to it (user POV)
- `/org/<org-slug>/<campaign-slug>`. The drive loads this directly, including the query-string preset. It does not arrive from the marketplace.

## Driving it with drive.mjs
- `node scripts/drive.mjs campaign-donate` loads `GET /org/verify-campaign/winter?amount=50&frequency=monthly`. The amount field is 50 and **Give Monthly** is selected.
- Then the same page without the query: **+100 USD** → **Continue with Card** → donor info → **Continue**. The payment step shows **Total donation $100.00**. The `POST /api/donation-intents` body includes the seeded campaign id.
- With filler keys the page shows "We couldn't start the payment…" and `stripe-stub.log` lists the refused server calls → status **blocked**.
- With `VERIFY_STRIPE_SK`/`VERIFY_STRIPE_PK` test keys: types 4242 4242 4242 4242 into the `Secure payment input frame` iframe → **pass**. It does not submit a charge.
- Proof: `campaign-donate-1-preset.png`, `-2-amount.png`, `-3-donor.png`, `-4-payment.png`, `-5-card.png` (test-key path only), each with a sibling `.aria.txt`.

## Gotchas
- `blocked` is not `pass`. Filler Stripe keys stop at the payment step the same way `donate-card` does.
- Don't wait for networkidle. Stripe.js retries with filler keys.
- The intent is posted when the payment step mounts, before the card iframe exists.
