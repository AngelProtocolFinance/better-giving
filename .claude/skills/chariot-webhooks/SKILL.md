---
name: chariot-webhooks
description: Chariot DAF webhook subscriptions — list, create, enable, disable, delete event subscriptions against the Chariot API. Sandbox vs production credentials, and the signing secret the /api/chariot-webhook route verifies against.
---

# Chariot Webhook Management

**Jurisdiction: `apps/platform/`.** `.env` and the route paths below live under `apps/platform/`.

## Credentials

`CHARIOT_API_KEY`, `CHARIOT_API_URL`, `CHARIOT_SIGNING_KEY`.

| env | api_url | api_key prefix |
|-----|---------|----------------|
| production | `https://api.givechariot.com` | `sk_live_` |
| sandbox | `https://sandboxapi.givechariot.com` | `sk_` |

`apps/platform/.env` holds **sandbox** credentials. Production credentials live only in Vercel env — pull them with `vercel env pull`, and never pair a key with the other environment's `api_url`. Confirm which environment with the user before any write.

## API Reference

Base: `{api_url}/v1/event_subscriptions` · Auth: `Authorization: Bearer {api_key}`

Vendored spec: `packages/chariot/specs/chariot.yaml` — the authority for field names and enums.

### List subscriptions

```bash
curl -s -X GET "{api_url}/v1/event_subscriptions" \
  -H "Authorization: Bearer {api_key}" | python3 -m json.tool
```

Takes `limit`/`cursor` (default and max 100). `GET .../{id}` fetches one.

### Create subscription

```bash
curl -s -X POST "{api_url}/v1/event_subscriptions" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://better.giving/api/chariot-webhook",
    "category": "grant.updated",
    "signingSecret": "'"$CHARIOT_SIGNING_KEY"'"
  }' | python3 -m json.tool
```

**The field is `signingSecret`, camelCase.** Unknown fields are ignored and the spec defaults the secret to a random string, so a misspelling creates a live subscription signed with a secret nobody holds — and `src/routes/api.chariot-webhook.ts:28-32` returns `201` on HMAC mismatch, so every webhook is silently dropped. Nothing surfaces until donations stop settling.

Categories (8, all of them): `grant.created`, `grant.updated`, `unintegrated_grant.created`, `unintegrated_grant.updated`, `disbursement.created`, `disbursement.updated`, `inbound_transfer.created`, `inbound_transfer.updated`.

The route only handles grants — `api.chariot-webhook.ts:36` calls `chariot.get_grant(payload.associated_object_id)` and branches on `grant.status`. Subscribe `grant.updated`; any other category posts an object the handler cannot resolve.

### Enable / disable / delete subscription

```bash
curl -s -X PATCH "{api_url}/v1/event_subscriptions/{id}" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}' | python3 -m json.tool
```

Settable statuses: `active`, `disabled`, `deleted`. A listed subscription may also read **`requires_attention`** — Chariot disabled it after repeated delivery failures. PATCH it back to `active` only once the endpoint is confirmed healthy.

**Note:** URL cannot be updated via PATCH — delete and recreate instead.

## Webhook Route

`src/routes/api.chariot-webhook.ts` → `/api/chariot-webhook`. Production URL: `https://better.giving/api/chariot-webhook`.

## Rules

1. **Always list first** before making changes so you see current state
2. **Confirm with user** before creating, enabling, or deleting subscriptions
