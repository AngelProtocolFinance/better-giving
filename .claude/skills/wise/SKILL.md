---
name: wise
description: Wise (TransferWise) money movement — sandbox V2 hosts and credentials (V1 dies June 30 2026), the two independent base-URL sources in the app, recipient-account lookups behind /api/wise/*, and the grant payout quote → transfer → fund chain.
---

# Wise

**Jurisdiction: `apps/platform/`.** Paths below are relative to it.

## Environments

| | host | portal |
|---|---|---|
| production | `api.wise.com` | `wise.com` |
| sandbox **V2** | `api.wise-sandbox.com` | `wise-sandbox.com` |
| sandbox V1 (dead) | `api.sandbox.transferwise.tech` | `sandbox.transferwise.tech` |

V1 is deprecated **June 30, 2026** — [migration guide](https://docs.wise.com/guides/developer/environments/sandbox-v2-migration). Endpoints, payloads and webhooks are identical across V1/V2; only hosts and credentials move.

- A V1 token issued after **April 1, 2025** does not authenticate against V2. New V2 credentials come from api@wise.com or the delivery contact.
- Ids created before that cutoff (profile, balance, account, transfer) carry over unchanged; test data created after it was **not** migrated — reseed recipients and transfers in V2 by hand.
- mTLS certs and JWE/JWS public keys are per-environment: regenerate for V2. Webhook signature public keys are shared, no change.

## Two base URLs, two sources

The app resolves the Wise host **twice**, and neither path reads the other:

1. `.server/kit/wise.ts` constructs `Wise` with `sandbox: stage === "staging"`; `lib/wise.ts:106-108` maps that boolean to a hardcoded host. `WISE_API_URL` is ignored here.
2. `src/routes/api.wise.$.ts:41` — the browser-facing proxy — fetches `${WISE_API_URL}/${path}`.

Consequences to check before believing a Wise failure is a credential problem:

- **`STAGE=local` sends the class to production.** Only `"staging"` flips the sandbox flag, so local dev calls `api.wise.com` with the sandbox token in `.env` while the proxy calls the sandbox — same request, two hosts, one 401.
- Moving to V2 means editing the hardcoded string in `lib/wise.ts` **and** `WISE_API_URL`; changing only the env var leaves every `kit/wise` call on V1.

## Env

`WISE_API_TOKEN`, `WISE_API_URL`, `WISE_PROFILE_ID`, `WISE_BALANCE_ID_USD` — declared in `.server/env.ts:121-126`, allowlisted in root `turbo.json:42-45`, documented in `.env.example:41-48`. `.env` holds sandbox credentials; production lives in Vercel (`vercel env pull`). Never pair a token with the other environment's host.

Re-derive the ids after a credential swap:

```bash
curl -s "$WISE_API_URL/v2/profiles" -H "authorization: Bearer $WISE_API_TOKEN" | python3 -m json.tool
curl -s "$WISE_API_URL/v4/profiles/$WISE_PROFILE_ID/balances?types=STANDARD" \
  -H "authorization: Bearer $WISE_API_TOKEN" | python3 -m json.tool
```

## Server surface

`lib/wise.ts` is the whole client — 5 methods, no SDK. Errors throw the raw response **text**, not a parsed body.

| method | endpoint | called from |
|---|---|---|
| `v2_account(id)` | `GET /v2/accounts/{id}` | `src/pages/platform-admin/banking-applications/api.ts`, `src/routes/dashboard.referrals/api.ts`, `transfer-grant.ts` |
| `balance(id, profile_id)` | `GET /v4/profiles/{p}/balances/{id}` | `src/routes/api.cron.grants/notif.ts` |
| `quote(profile_id, …)` | `POST /v3/profiles/{p}/quotes` | `transfer-grant.ts` |
| `transfer(…)` | `POST /v1/transfers` | `transfer-grant.ts` |
| `fund_transfer(…)` | `POST /v3/profiles/{p}/transfers/{t}/payments` | `transfer-grant.ts` |

**Payout chain** — `src/routes/api.cron.grants/transfer-grant.ts`: `v2_account` → `quote` → `transfer` → `fund_transfer`. `customerTransactionId` is the caller's `ref` and is Wise's idempotency key: reusing a ref returns the original transfer instead of creating a second one. `transfer()` resolves with HTTP 200 while carrying `errors` — the call site throws on it. `fund_transfer` returning `status: "REJECTED"` is the insufficient-balance case (`errorCode`), not an exception.

## Browser surface

`/api/wise/*` (`src/routes/api.wise.$.ts`) proxies the client straight to Wise so recipient-form requirements stay dynamic. It substitutes `{{profileId}}` in both path and body, injects the bearer token, and forwards only `accept-minor-version` and `content-type`. The client never sees a token or a profile id.

Consumers: `src/components/bank-details/use-currencies.ts` (`/v1/currencies`), `.../recipient-details/use-requirements.ts` (`/v3/profiles/{{profileId}}/quotes`, `/v1/quotes/{id}/account-requirements`), `.../recipient-details-form.tsx` (`POST /v1/accounts`).

Tests never reach Wise: `src/__tests__/wise-handlers.ts` holds the MSW handlers for the proxy paths, and `$/kit/wise` is `vi.mock`ed in the banking and application-review suites.

## Rules

1. Confirm which environment a token belongs to before running a write (`transfer`, `fund_transfer`, `POST /v1/accounts`) — a production token funds a real payout.
2. Read a balance before initiating a funded transfer; `REJECTED` with no balance is the common sandbox failure.
