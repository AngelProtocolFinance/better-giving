---
name: upstash-manager
description: Manage and debug QStash — schedules (crons), queues, DLQ, event logs. List, create, delete, pause, resume, trigger schedules. Inspect queue lag, view delivery events, check and replay dead letters.
user_invocable: true
---

# Upstash QStash Manager

## Auth

Two separate auth mechanisms:

**Management API** (`api.upstash.com`) — creds in `.env` as `UPSTASH_EMAIL` / `UPSTASH_API_KEY`:

```sh
curl -s -H "Authorization: Basic $(echo -n 'EMAIL:API_KEY' | base64)" \
  "https://api.upstash.com/v2/..."
```

**QStash API** (`qstash.upstash.io/v2`) — token in `.env` as `UPSTASH_QSTASH_TOKEN`:

```sh
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/..."
```

## Conventions

- schedule IDs prefixed: `better-giving-{stage}-{name}`
- queue names prefixed: `better-giving-{stage}-{suffix}`
- production destination: `https://better.giving`
- preview destination: `https://test.better.giving`

## Current resources

### Schedules (crons)

| name | cron | route |
|------|------|-------|
| savings-snapshot | `0 0 * * *` | `/api/cron/savings-snapshot` |
| nav-update | `0 6 * * *` | `/api/cron/nav-update` |
| currencies | `0 */6 * * *` | `/api/cron/currencies` |
| commissions | `0 0 1 * *` | `/api/cron/commissions` |
| grants | `0 0 */3 * *` | `/api/cron/grants` |

### Queues

| name | purpose |
|------|---------|
| `better-giving-production-q` | main dispatch queue (parallelism: 1) |
| `better-giving-production-don-dist-q` | donation distribution fan-out (parallelism: 1) |

---

## Schedules API

### List

```sh
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/schedules"
```

### Create

```sh
curl -s -X POST "https://qstash.upstash.io/v2/schedules/$DESTINATION_URL" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: $CRON_EXPRESSION" \
  -H "Upstash-Schedule-Id: $SCHEDULE_ID"
```

### Get / Delete / Pause / Resume

```sh
# get
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/schedules/$SCHEDULE_ID"

# delete
curl -s -X DELETE -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/schedules/$SCHEDULE_ID"

# pause
curl -s -X PATCH -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/schedules/$SCHEDULE_ID/pause"

# resume
curl -s -X PATCH -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/schedules/$SCHEDULE_ID/resume"
```

---

## Queues API

### List queues

```sh
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/queues"
```

Shows `name`, `parallelism`, `lag`, `paused` for each queue.

### Get queue

```sh
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/queues/$QUEUE_NAME"
```

### Create / Update queue

```sh
curl -s -X POST "https://qstash.upstash.io/v2/queues" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"queueName": "$QUEUE_NAME", "parallelism": 1}'
```

### Pause / Resume queue

```sh
# pause
curl -s -X POST "https://qstash.upstash.io/v2/queues/$QUEUE_NAME/pause" \
  -H "Authorization: Bearer $QSTASH_TOKEN"

# resume
curl -s -X POST "https://qstash.upstash.io/v2/queues/$QUEUE_NAME/resume" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

### Delete queue

```sh
curl -s -X DELETE -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/queues/$QUEUE_NAME"
```

---

## Publish (one-shot trigger)

```sh
# direct publish
curl -s -X POST "https://qstash.upstash.io/v2/publish/$DESTINATION_URL" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '$BODY'

# publish to queue
curl -s -X POST "https://qstash.upstash.io/v2/enqueue/$QUEUE_NAME/$DESTINATION_URL" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '$BODY'
```

---

## Events / Logs

### List recent events

```sh
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/events"
```

Returns `events[]` with: `time`, `messageId`, `state`, `url`, `queueName`, `responseStatus`, `duration`, `body` (base64).

### Filter events

```sh
# by state: CREATED, ACTIVE, DELIVERED, ERROR, RETRY, FAILED
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/events?state=ERROR"

# by message ID
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/events?messageId=$MSG_ID"

# by queue
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/events?queueName=$QUEUE_NAME"
```

### Decode event body

Event bodies are base64-encoded. Decode with:

```sh
echo "$BASE64_BODY" | base64 -d | python3 -m json.tool
```

---

## Dead Letter Queue (DLQ)

### List DLQ messages

```sh
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/dlq"
```

### Delete from DLQ

```sh
# single message
curl -s -X DELETE -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/dlq/$DLQ_ID"

# purge all
curl -s -X DELETE -H "Authorization: Bearer $QSTASH_TOKEN" \
  "https://qstash.upstash.io/v2/dlq"
```

---

## Debugging workflow

1. **pull token** from Vercel env
2. **check queues** — look for non-zero `lag` (messages stuck)
3. **check events** — filter by `state=ERROR` or `state=FAILED` to find failures
4. **decode body** of failed messages to understand payload
5. **check DLQ** — messages that exhausted retries land here
6. **replay** — re-publish the decoded body to the same destination URL
7. **check schedules** — verify crons are active and pointing to correct URLs
