## MODIFIED Requirements

### Requirement: Runtime Orchestrator MUST enforce unique active runtime per engine-workspace pair

The system MUST treat `(engine, workspace)` as the unique identity for a managed runtime instance and MUST prevent duplicate active runtimes for the same pair, including concurrent automatic recovery sources, replacement overlap, and reuse of a runtime that has already entered a stopping/manual-shutdown lifecycle.

#### Scenario: repeated ensure is idempotent

- **WHEN** the client issues repeated `connect` or `ensureRuntimeReady` requests for the same `(engine, workspace)`
- **THEN** the system MUST reuse the existing active runtime or the existing in-flight startup instead of spawning a second runtime
- **AND** a runtime already marked `manual shutdown`, `runtime ended`, or equivalent stopping-predecessor state MUST NOT be treated as that reusable active runtime

#### Scenario: concurrent automatic recovery sources reuse one guarded acquire

- **WHEN** multiple automatic recovery sources target the same `(engine, workspace)` while no healthy runtime is ready
- **THEN** the orchestrator MUST expose one in-flight guarded acquire for that pair
- **AND** later callers MUST join that acquire as waiters or receive a guarded degraded outcome instead of creating a parallel runtime

#### Scenario: replacement stops old runtime after swap

- **WHEN** the system replaces an existing managed runtime for the same `(engine, workspace)`
- **THEN** it MUST complete startup for the new runtime, swap the registry binding, and stop the old runtime through the managed shutdown path

#### Scenario: stopping predecessor is not reused for user-triggered new thread

- **WHEN** the current runtime for a `(engine, workspace)` pair has already entered manual shutdown or equivalent stopping-predecessor lifecycle
- **AND** the user starts a new thread or equivalent runtime-required foreground action
- **THEN** the orchestrator MUST treat that stopping runtime as non-reusable
- **AND** the action MUST acquire or wait for a fresh successor runtime before foreground execution proceeds

#### Scenario: replacement overlap is capped to one stopping predecessor

- **WHEN** a replacement is already in progress for a managed runtime
- **THEN** the orchestrator MUST allow at most one active successor and one stopping predecessor for that `(engine, workspace)`
- **AND** further automatic recovery sources MUST NOT start an additional replacement until the predecessor stop path has settled or timed out
