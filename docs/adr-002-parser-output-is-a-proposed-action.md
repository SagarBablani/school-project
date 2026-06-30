# ADR 002: Parser Output Is A Proposed Action

## Status

Accepted.

## Context

Documents can be ambiguous or hostile. The system should not silently turn model or parser output into high-impact school actions.

## Decision

Every document stores original text, parsed fields, confidence, ambiguity notes, unsafe flags, and approval state. Assignments, rosters, and policies are committed only after an admin or teacher approves the parsed proposal.

## Consequences

The workflow is slower than fully automatic creation, but safer and easier to audit. A future LLM parser can plug into the same contract.
