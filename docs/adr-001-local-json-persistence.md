# ADR 001: Local JSON Persistence For The Take-Home

## Status

Accepted.

## Context

The assignment rewards production-shaped boundaries, but the reviewer needs to run the app quickly. A database dependency would add setup time and make the demo more brittle.

## Decision

Use a JSON file in `work/data.json` behind a small store abstraction. All writes go through `mutate`, which saves atomically through a temporary file rename. `mutate` calls are queued so only one mutate-then-save runs at a time in the process; without this, two concurrent requests could both call `save()` while a prior save's temp-file rename was still in flight, causing lost writes or an `ENOENT` crash on the rename.

## Consequences

The app is easy to run and inspect, and safe under concurrent requests within a single process. It is not safe for concurrent multi-process writes (no cross-process file lock). The store boundary is narrow enough to replace with Postgres transactions later.
