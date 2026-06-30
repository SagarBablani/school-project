# ADR 003: Server-Sent Events For Live Updates

## Status

Accepted.

## Context

The dashboard needs to update when documents are approved, students submit work, and reminders run. The interaction is mostly server-to-client broadcast.

## Decision

Use Server-Sent Events at `/api/events`. Clients refresh their snapshot when an update event arrives.

## Consequences

SSE keeps the implementation small and reliable for the demo. It does not support bidirectional realtime messaging, which is acceptable because writes already use normal POST requests.
