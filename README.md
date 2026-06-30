# School Operations Agent Platform

A focused take-home implementation for the SIM senior engineering assignment. It models a school operations agent platform with registration, scoped roles, document parsing and approval, intent routing, policy-aware reminders, live dashboard updates, and an audit timeline.

## Stack

- React + Vite frontend
- Express API with separate models, controllers, middleware, and routes
- JSON file persistence for a demo-friendly local database
- Server-sent events for live dashboard updates
- Deterministic document parsing with file upload support for `.txt`, `.pdf`, `.docx`, and images
- Idempotent webhook intake for Telegram/WhatsApp-style chat bindings
- Scheduler with durable run state and optional cron scheduling
- Node test runner for auth, parser, and reminder coverage

## Run Locally

```bash
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

6. Use the chat simulator as a student for progress, blocked, and submission messages.
7. Run reminders manually. Blocked students escalate, submitted students are skipped, and repeated runs are idempotent for the same day.
8. Try a wrong-context action by sending a message against an assignment outside the actor scope. The API rejects it and records `access.denied`.
9. Open the audit tab to explain the scenario without inspecting the data file.

## Domain Model

- `school`: tenant boundary and reminder policy.
- `class`: grade/class scoped to a school.
- `user`: admin, teacher, student, or guardian.
- `invite`: short-lived scoped onboarding code.
- `document`: original text, parsed output, ambiguity notes, confidence, and approval state.
- `assignment`: deterministic action created only after document approval.
- `submission`: explicit student assignment state with history.
- `reminder`: idempotent daily reminder decision.
- `auditEvent`: append-only timeline for registration, login, invite, parse, approve, assign, remind, submit, feedback, denial, and unsafe input.

## Access Model

All API routes load the current user from an HTTP-only signed session cookie. School ID is checked on every scoped read/write. Admins can operate within their school. Teachers can read assignments for their assigned classes. Students can read only their target assignments. Guardians can read assignments for linked students. Sensitive actions are server-side checked even when the UI hides controls.

## Parser Strategy

The parser is deterministic for the exercise and treats extracted values as proposed actions. Assignment, roster, and policy documents produce structured fields plus confidence and ambiguity notes. Missing due dates, unknown classes, duplicate roster rows, incomplete guardian contacts, and unsafe prompt-injection-like text require review before business state changes.

## Known Limitations

- Chat is simulated in the web app, but the API includes webhook endpoints for Telegram and WhatsApp-style envelope handling with binding and idempotency.
- Uploaded documents are accepted as `.txt`, `.pdf`, `.docx`, and supported image formats; the server stores the original file and extracts text via parser and OCR.
- JSON persistence is intentionally simple; a production version should use Postgres with transactions and unique constraints.
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
