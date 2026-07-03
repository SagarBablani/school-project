# ADR 006: Telegram Bot Via Long Polling

## Status

Accepted.

## Context

Deliverable #2 asks for one chat channel "working end-to-end," not just an endpoint that accepts the right JSON shape. A real Telegram *webhook* requires a publicly reachable HTTPS URL registered with Telegram, which a local/sandboxed dev environment doesn't have. Telegram's `getUpdates` long-polling API gives the same inbound delivery without one.

## Decision

When `TELEGRAM_BOT_TOKEN` is set, `src/telegramBot.js` polls `getUpdates` in a loop and feeds each update through the same `applyIncomingMessage` function the HTTP webhook route uses (extracted from `chatController.js` for this reuse). Outbound replies and reminder pushes go through `sendMessage`. If the token isn't set, nothing changes: no polling starts, no network calls happen, and `/api/webhook/telegram` keeps accepting webhook-shaped payloads exactly as before (useful for tests and for a future real-webhook deployment).

Reminder delivery (`src/notify.js`) is resolved as pure data lookup inside the same `store.mutate` transaction as `runReminderEngine`, but the actual `sendMessage` calls happen after the transaction commits — a Telegram API failure can delay a notification, but it can never fail or roll back a save.

Idempotency for duplicate delivery already existed for the HTTP webhook route (`idempotencyKeys` keyed by `provider:chatId:messageId`); the poller reuses it, so it doesn't need its own durable offset — a restart just means Telegram redelivers a small window of already-seen updates, which are deduped for free.

## Consequences

A single `TELEGRAM_BOT_TOKEN` env var turns this from a simulated/HTTP-only channel into a real one: students and guardians can message an actual bot and get real state changes plus a reply, and blocked/nudge reminders are pushed as real Telegram messages to linked, opted-in recipients. The cost is one more optional long-running loop per process and a dependency on Telegram's API being reachable; both are acceptable for a take-home and degrade to today's simulated behavior with no token configured.
