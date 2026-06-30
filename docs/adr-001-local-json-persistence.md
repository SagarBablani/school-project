# ADR 001: Local JSON Persistence For The Take-Home

## Status

Accepted.

## Context

The assignment rewards production-shaped boundaries, but the reviewer needs to run the app quickly. A database dependency would add setup time and make the demo more brittle.

## Decision

Use a JSON file in `work/data.json` behind a small store abstraction. All writes go through `mutate`, which saves atomically through a temporary file rename.

## Consequences

The app is easy to run and inspect. It is not safe for concurrent multi-process writes. The store boundary is narrow enough to replace with Postgres transactions later.
