# ADR 005: Chat-Classified Assignment Changes Require A Dashboard Action

## Status

Accepted.

## Context

The intent layer classifies `update_assignment` and `cancel_assignment` from free-text chat messages alongside student/teacher/guardian intents. Unlike a document upload, a chat message has no review step before it would take effect.

## Decision

`identifyIntent` still classifies and audits `update_assignment` and `cancel_assignment` for traceability, but neither `messageController` nor `chatController` mutate assignment state from them. The audit entry notes that the change must be applied through `PATCH /api/assignments/:id` or `POST /api/assignments/:id/cancel`, which are explicit, role-checked, school/class-scoped actions surfaced in the teacher/admin dashboard.

## Consequences

This keeps the same approval boundary used for document parsing (ADR 002): free-text or model-derived signals are proposals or classifications, never direct writes to high-impact state. It costs an extra click for update/cancel, but a misclassified or spoofed chat message cannot silently reschedule or cancel a real assignment.
