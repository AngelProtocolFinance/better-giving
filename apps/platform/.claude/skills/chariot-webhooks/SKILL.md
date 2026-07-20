---
name: chariot-webhooks
description: Manage Chariot DAF webhook subscriptions — list, create, enable, disable, or delete event subscriptions via the Chariot API
---

# Chariot Webhook Management

## Overview

CRUD operations on Chariot event subscriptions (webhooks) via their REST API.

## When to Use

- User mentions "chariot webhook", "chariot subscription", "DAF webhook"
- User wants to list, create, enable, disable, or delete chariot event subscriptions

## Credentials

Read `CHARIOT_API_KEY` / `CHARIOT_API_URL` from `.env` (or Vercel env for production):

| env | api_url | api_key prefix |
|-----|---------|----------------|
| production | `https://api.givechariot.com` | `sk_live_` |
| sandbox | `https://sandboxapi.givechariot.com` | `sk_` |

Default to **production** unless user says sandbox/staging.

## API Reference

Base: `{api_url}/v1/event_subscriptions`
Auth: `Authorization: Bearer {api_key}`

### List subscriptions

```bash
curl -s -X GET "{api_url}/v1/event_subscriptions" \
  -H "Authorization: Bearer {api_key}" | python3 -m json.tool
```

### Create subscription

```bash
curl -s -X POST "{api_url}/v1/event_subscriptions" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://better.giving/api/chariot-webhook",
    "category": "grant.updated",
    "signing_secret": "{signing_key}"
  }' | python3 -m json.tool
```

Available categories: `grant.created`, `grant.updated`, `unintegrated_grant.created`, `unintegrated_grant.updated`, `disbursement.created`, `disbursement.updated`, `inbound_transfer.created`, `inbound_transfer.updated`, `donation.created`, `donation.updated`, `deposit.created`, `deposit.updated`

### Enable / disable / delete subscription

```bash
curl -s -X PATCH "{api_url}/v1/event_subscriptions/{id}" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}' | python3 -m json.tool
```

Valid statuses: `active`, `disabled`, `deleted`

**Note:** URL cannot be updated via PATCH — delete and recreate instead.

## Webhook Route

The app receives Chariot webhooks at `src/routes/api.chariot-webhook.ts` → `/api/chariot-webhook`.

Production URL: `https://better.giving/api/chariot-webhook`

## Rules

1. **Always list first** before making changes so you see current state
2. **Confirm with user** before creating, enabling, or deleting subscriptions
3. Read API key from `.env` (or Vercel env for prod) — don't hardcode or ask the user for it
