## MODIFIED Requirements

### Requirement: New Runtime-Required Actions MUST Start From A Fresh Guarded Attempt

When the user initiates a new runtime-required action after a prior runtime failure, or while the previously bound managed runtime has already entered a stopping/manual-shutdown lifecycle, the system MUST ensure that the new attempt does not inherit an unbounded retry loop, stale in-flight recovery state, or a runtime instance that is already on its way out.

#### Scenario: new thread after prior failure starts a fresh acquisition cycle

- **WHEN** the user starts a new thread after the same `workspace + engine` previously entered degraded or quarantined recovery state
- **THEN** the system MUST begin a fresh guarded runtime acquisition attempt for that user action
- **AND** the new attempt MUST NOT reuse a stale automatic retry loop that was already exhausted

#### Scenario: explicit user retry can reopen recovery after quarantine

- **WHEN** a `workspace + engine` pair is currently quarantined and the user explicitly retries or reconnects
- **THEN** the system MUST allow a fresh guarded recovery cycle to start
- **AND** the system MUST keep the retry sequence bounded by the same recovery contract

#### Scenario: create session ignores stopping runtime marked for manual shutdown

- **WHEN** the user starts a new thread or creates a new session while the currently registered managed runtime has already been marked `manual shutdown`, `runtime ended`, or equivalent stopping lifecycle
- **THEN** the system MUST reject that runtime as a reusable foreground execution target
- **AND** the create-session path MUST start or await a fresh guarded runtime attempt instead of surfacing the stale stopping-runtime binding as the first execution target

#### Scenario: create session gets one bounded fresh retry after stopping-runtime race

- **WHEN** a user-initiated create-session request reaches `thread/start` and the bound runtime still ends due to the same stopping/manual-shutdown race before the new turn is created
- **THEN** the system MUST perform one bounded fresh reacquire or equivalent guarded retry for that user action
- **AND** the flow MUST settle as either a successful new session or a recoverable failure without requiring an unbounded reconnect loop
