# School Operations Agent Platform

A focused take-home implementation for the SIM senior engineering assignment. It models a school operations agent platform with registration, scoped roles, document parsing and approval, intent routing, policy-aware reminders, live dashboard updates, and an audit timeline.

## Stack

- React + Vite frontend
- Express API with separate models, controllers, middleware, and routes
- JSON file persistence for a demo-friendly local database
- Server-sent events for live dashboard updates
- Deterministic document parsing with file upload support for `.txt`, `.pdf`, `.docx`, and images
- A real Telegram channel via long-polling (optional, no public URL needed), plus idempotent webhook intake for Telegram/WhatsApp-style chat bindings
- Scheduler with durable run state and optional cron scheduling
- Node test runner for auth, parser, and reminder coverage

## Run Locally

```bash
Build Node Version 22.11.0
npm install
npm run api
npm run dev
```

Open `http://127.0.0.1:5173`.

For a production-style static run:

```bash
npm run build
npm start
```

Open `http://127.0.0.1:4000`.

## Architecture

```
 React (Vite) ──HTTP/JSON──▶ Express API ──▶ controllers ──▶ models/schoolOpsModel.js
      ▲                         │                                   │
      │ SSE (/api/events)       ▼                                   ▼
      └──────────────────  broadcast()                      JsonStore (work/data.json)
                                 │                                   ▲
                                 ▼                                   │
                     scheduler.js (reminders, every 5m/cron) ────────┘
                                 │
                                 ▼
                     notify.js ──sendMessage──▶ Telegram Bot API
                                 ▲
                                 │ getUpdates (long-poll)
                     telegramBot.js ◀────────────────────── real Telegram chat
```

Everything under `src/controllers` goes through `models/schoolOpsModel.js` and `auth.js` for scoping, and every mutation is appended to `auditEvent`s inside the same `store.mutate` transaction. `telegramBot.js` and `notify.js` are the only pieces that talk to the outside world, and only when `TELEGRAM_BOT_TOKEN` is set.

## Assumptions

- A single JSON file is an acceptable database for this exercise (see ADR 001); the store boundary is narrow so it can be swapped for Postgres without touching controllers.
- "Working end-to-end" for the chat channel means a real inbound+outbound loop through one provider's API (Telegram, via long-polling), not a fully-featured multi-provider integration — WhatsApp keeps the same webhook-shaped intake as before, unwired to a live send.
- Parsing is deterministic/rule-based rather than an LLM call, per ADR 002 — the approval boundary is designed so a real model could be dropped in later without changing the controllers.
- Demo users are always created with the password `demo1234` (roster import) or whatever the registering/joining user chooses (register/invite); there's no separate "seed a demo admin" step — the first admin only exists after someone actually submits the Register form.
- A school is a single tenant with one reminder policy; multi-policy or multi-timezone schools are out of scope.

## Demo Flow

1. Register `Northstar Public School` as an admin.
2. Click `Seed classes` or create `Grade 6A` and `Grade 6B`.
3. Create a teacher invite and join from another browser/session using the invite code.
4. Upload a roster document or attach a file. Example:

```text
student,class,guardian
Riya Sen,Grade 6A,riya.parent@example.com
Kabir Mehta,Grade 6A,kabir.parent@example.com
Kabir Mehta,Grade 6A,kabir.parent@example.com
```

The duplicate row is flagged for review. Approving imports demo student and guardian users with password `demo1234`.

5. Upload an assignment brief via text or file. Example:

```text
Title: Cell Structure Lab Reflection
Subject: Biology
Class: Grade 6A
Due: 2026-07-08
Write a 300 word reflection and include one diagram.
```

Review parsed fields and approve to create the assignment.

6. Use the chat simulator as a student for progress, blocked, submission, and resubmission messages. Teacher-side text can request a revision or mark completion.
7. Run reminders manually. Blocked students escalate, submitted students are skipped, cancelled assignments are excluded, and repeated runs are idempotent for the same day.
8. Try a wrong-context action (e.g. a teacher cancelling an assignment outside their classes, or a message against an assignment outside the actor scope). The API rejects it with `403` and records `access.denied`.
9. As admin or the assigned teacher, update an assignment's due date or cancel it from the Operations tab; both are audited as `assignment.updated` / `assignment.cancelled` and cancelled assignments stop generating reminders.
10. As a guardian, opt in to updates and request a digest from the Guardian dashboard; both call scoped guardian-only endpoints and are audited.
11. Open the audit tab to explain the scenario without inspecting the data file.

## Chat Channel (Telegram)

By default chat is HTTP-only: `/api/webhook/telegram` and `/api/webhook/whatsapp` accept provider-shaped payloads and the web Chat tab simulates sending them. To make Telegram a real, working end-to-end channel:

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`, and copy the token it gives you.
2. Set `TELEGRAM_BOT_TOKEN=<token>` in `.env` (or the environment) and start the API. It starts long-polling automatically — no public URL or webhook registration needed (see ADR 006).
3. Open a chat with your bot on Telegram and send it any message. It replies with a chat ID.
4. In the web app, go to the **Chat** tab → "Link a real Telegram chat", paste that chat ID, and click **Link**.
5. Message the bot again (e.g. "I am blocked") — it updates the real submission state and replies. Run reminders (manually or via the scheduler); any nudge/escalation for that student, or for an opted-in linked guardian, is pushed as a real Telegram message.

## Domain Model

- `school`: tenant boundary and reminder policy.
- `class`: grade/class scoped to a school.
- `user`: admin, teacher, student, or guardian.
- `invite`: short-lived scoped onboarding code.
- `document`: original text, parsed output, ambiguity notes, confidence, and approval state.
- `assignment`: deterministic action created only after document approval; supports explicit `assigned -> cancelled` transitions and field updates via dashboard actions (not free-text chat, see ADR 005).
- `submission`: explicit student assignment state (`not_started -> in_progress -> blocked/submitted -> revision_requested -> resubmitted -> completed`) with history.
- `reminder`: idempotent daily reminder decision.
- `auditEvent`: append-only timeline for registration, login, invite, parse, approve, assign, remind, submit, feedback, denial, and unsafe input.

## Access Model

All API routes load the current user from an HTTP-only signed session cookie. School ID is checked on every scoped read/write. Admins can operate within their school. Teachers can read assignments for their assigned classes. Students can read only their target assignments. Guardians can read assignments for linked students. Sensitive actions are server-side checked even when the UI hides controls.

## Parser Strategy

The parser is deterministic for the exercise and treats extracted values as proposed actions. Assignment, roster, and policy documents produce structured fields plus confidence and ambiguity notes. Missing due dates, unknown classes, duplicate roster rows, incomplete guardian contacts, and unsafe prompt-injection-like text require review before business state changes.

## Intent Layer

`identifyIntent` classifies incoming chat/webhook text into: `submission`, `resubmission`, `blocked_help_request`, `progress_update`, `revision_request`, `completion_decision`, `teacher_feedback`, `parent_opt_in`, `escalation_acknowledgement`, `parent_digest_request`, `update_assignment`, `cancel_assignment`, `create_assignment`, `unsafe`, and `unknown`. A deterministic business rule layered on top of the classifier promotes a plain `submission` to `resubmission` when the student's current status is `revision_requested` or `blocked`, so model-style pattern matching and state-machine logic stay separate. Guardian-only intents (`parent_opt_in`, `escalation_acknowledgement`, `parent_digest_request`) are applied to the guardian's own account rather than to an assignment. `update_assignment` and `cancel_assignment` are classified and audited but never auto-applied from free text — see [ADR 005](docs/adr-005-chat-intents-do-not-mutate-assignments.md).

## Known Limitations

- Telegram can be a real, working channel when `TELEGRAM_BOT_TOKEN` is set (see "Chat Channel" above and ADR 006); without it, chat is simulated in the web app. WhatsApp only has the webhook-shaped intake endpoint — no live send integration.
- Uploaded documents are accepted as `.txt`, `.pdf`, `.docx`, and supported image formats; the server stores the original file and extracts text via parser and OCR.
- JSON persistence is intentionally simple; writes within a process are serialized so concurrent requests can't corrupt `work/data.json` (see ADR 001), but there is no cross-process lock. A production version should use Postgres with transactions and unique constraints.
- The parser is rule-based. A production version would use a validated structured LLM output behind the same approval boundary.
- SSE is enough for the live dashboard demo; a larger deployment may prefer a message bus and WebSocket gateway.

## Tests

```bash
npm test
```

Coverage focuses on the highest-risk boundaries: auth scoping, prompt-injection fallback, parser ambiguity, reminder policy, webhook idempotency, and scheduler state.

## Advanced notes

- The scheduler supports an optional `SCHEDULER_CRON` environment variable for cron-style execution.
- Uploaded files are persisted under `work/uploads` and text is extracted for review before approval.
- Chat webhooks are designed to be safe on duplicate delivery through idempotency keys.
