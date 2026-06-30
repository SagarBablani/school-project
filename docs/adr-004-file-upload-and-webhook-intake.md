# ADR 004: File Upload and Webhook Intake

## Status

Accepted.

## Context

The demo should support document-driven operations from both pasted text and uploaded files, and it should allow chat-based status updates from external messaging channels.

## Decision

- Use `multer` with memory storage to accept file uploads at `/api/documents`.
- Support `.txt`, `.pdf`, `.docx`, and common image formats.
- Extract text from files using deterministic parsing, `pdf-parse`, `mammoth`, and `tesseract.js` OCR.
- Store original file metadata and save uploaded file blobs to `work/uploads`.
- Implement webhook intake endpoints for Telegram and WhatsApp-style envelopes at `/api/webhook/telegram` and `/api/webhook/whatsapp`.
- Use chat binding records plus idempotency keys to safely deduplicate repeated webhook deliveries.

## Consequences

- The demo surface supports realistic document ingestion and multi-channel chat status updates.
- The parser remains proposal-driven, so uploaded content still requires approval before business changes.
- Duplicate webhook deliveries do not create repeated state changes.
