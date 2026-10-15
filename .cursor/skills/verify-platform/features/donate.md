# Donate

Donate lets a visitor pick an amount, choose card, enter a name and email, and review a $100 summary for the seeded nonprofit. Typing a card number needs Stripe test keys.

## Sub-features

- `donate-open` opens the form from the seeded marketplace card.
- `donate-amount` adds 100 USD.
- `donate-donor` collects email, first name, and last name.
- `donate-summary` shows a total of $100.00.
- `donate-card` types a test card into the payment element. Unreachable without Stripe test keys.

## How to get to it (user POV)

- On Marketplace, choose `Donate` on a nonprofit card.
- Open `/donate/<id>` directly.

## Driving it with drive.mjs

Preconditions:

- The app is healthy at `http://127.0.0.1:4200`.
- `Verify Test Nonprofit` is seeded and `scripts/doctor.sh` sees the local database.
- USD rates are seeded, so the amount button reads `+100 USD`.
- Card entry additionally needs `VERIFY_STRIPE_SK=sk_test_…` and `VERIFY_STRIPE_PK=pk_test_…` in the environment before launch. Live keys are refused. Do not write keys into a file.

- **Open form.** From `/`, choose footer `Marketplace`, then `Donate` on the card headed `Verify Test Nonprofit`. Run `node scripts/drive.mjs donate`. The URL matches `/donate/<id>` and the nonprofit name is on the page.
- **Amount.** Choose the button named `+100 USD`.
- **Method and donor.** Choose `Continue with Card`. A region containing `Payment information` appears. Fill the textbox named `Your email` with `donor@example.com`, `First name` with `Verify`, and `Last name` with `Donor`.
- **Summary.** Choose the button named `Continue`. The page shows `Your donation summary` and `Total donation` `$100.00`. Proof of the steps: `donate-amount.png`, `donate-donor.png`, `donate-summary.png`, and `donate-summary.aria.txt`.
- **Card number.** When the secure payment frame is visible, type `4242424242424242` into its card number field. Proof: `donate-card.png`. The drive does not submit a charge.
- **Direct URL.** Opening `/donate/<id>` is a second entry point. This drive does not take it. Do not mark it verified from the marketplace card.

## Gotchas

- Without Stripe test keys the summary can still render while the page says it could not start the payment, and `stripe-stub.log` in the state directory lists the refused server calls. That result is `unreachable`, not `pass`.
- Do not wait for network idle. Stripe.js and analytics keep connections open. Wait for `Your donation summary`.
- `Express checkout failed to load` and `PayPal failed to load` are expected with filler keys. They do not by themselves fail the summary check.
- The amount control is a button whose accessible name is `+100 USD`, not a data-testid.
