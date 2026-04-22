# runtime-pool-console Specification

## Purpose
TBD - created by archiving change runtime-orchestrator-pool-console. Update Purpose after archive.
## Requirements
### Requirement: Settings MUST expose a runtime pool console
The system MUST provide a settings surface that exposes the current runtime pool state and runtime budget configuration.

#### Scenario: settings shows engine pool summary
- **WHEN** the user opens the runtime pool console
- **THEN** the panel MUST display current managed runtime counts by engine and the configured runtime budget values

#### Scenario: settings shows runtime instance rows
- **WHEN** the runtime pool console renders managed runtime entries
- **THEN** each row MUST display workspace identity, engine, lifecycle state, and lease source information

### Requirement: Runtime pool console MUST surface process diagnostics for managed runtimes

The runtime pool console MUST expose enough continuity diagnostics to explain whether a Codex runtime is truly executing resumed work, merely retained, or stalled while waiting for fusion continuation to settle.

#### Scenario: runtime row distinguishes stalled fusion continuation from retained idle

- **WHEN** a runtime has no current turn or stream lease
- **AND** the same `workspace + engine` still has a queue-fusion continuation in pending or stalled foreground continuity
- **THEN** the runtime pool console MUST expose that row as stalled foreground continuation rather than plain idle or generic retained busy
- **AND** the row MUST show the stalled continuation reason separately from pinned / warm retention metadata

#### Scenario: runtime row clears stalled fusion continuity after terminal settlement

- **WHEN** the corresponding fusion continuation later receives completed, error, runtime-ended, or equivalent terminal settlement
- **THEN** the runtime pool console MUST clear the stalled fusion continuity marker
- **AND** the row MUST converge to the ordinary settled runtime state without stale busy residue

### Requirement: Runtime pool console MUST allow controlled manual intervention
The system MUST allow users to manually intervene in idle or retained managed runtimes from the runtime pool console.

#### Scenario: user closes idle runtime
- **WHEN** the user triggers close on a non-busy managed runtime
- **THEN** the system MUST stop that runtime through the managed shutdown path and refresh the pool snapshot

#### Scenario: busy runtime close requires confirmation
- **WHEN** the user triggers close on a busy managed runtime
- **THEN** the system MUST require explicit confirmation before attempting shutdown

#### Scenario: user pins runtime without duplicating instance
- **WHEN** the user marks a runtime as pinned
- **THEN** the system MUST retain that runtime under the pinned policy without spawning a duplicate runtime for the same `(engine, workspace)`

### Requirement: Runtime pool console MUST allow budget and retention tuning
The settings surface MUST allow users to configure runtime budget and retention parameters for managed runtimes without changing the survival contract of actively protected work.

#### Scenario: user adjusts runtime budget
- **WHEN** the user changes the configured hot or warm runtime budget
- **THEN** the system MUST persist the new budget and apply it to subsequent runtime orchestration decisions

#### Scenario: reducing budget does not clone or instantly duplicate runtimes
- **WHEN** the user lowers a runtime budget value
- **THEN** the system MUST apply the new limit through orchestrator eviction/release rules instead of creating new runtime instances

#### Scenario: user adjusts warm ttl
- **WHEN** the user updates the warm retention TTL in the runtime pool console
- **THEN** the system MUST persist the new TTL and use it for subsequent cooling decisions

#### Scenario: warm ttl never overrides an active lease

- **WHEN** a managed runtime still has an active turn lease or stream lease
- **THEN** warm retention TTL and budget overflow rules MUST NOT evict that runtime
- **AND** the console MUST continue to represent the runtime as active-work protected rather than merely warm

### Requirement: Runtime pool console MUST expose restore and cleanup policy toggles
The settings surface MUST expose the key lifecycle policy toggles that affect runtime startup and shutdown behavior.

#### Scenario: user enables restore metadata without runtime restore
- **WHEN** the user selects the policy to restore workspace/thread metadata without restoring runtimes
- **THEN** the system MUST preserve UI/session restore behavior while leaving managed runtime acquisition to explicit runtime-required actions

#### Scenario: user enables orphan sweep on launch
- **WHEN** the user enables orphan sweep on launch
- **THEN** the system MUST attempt launch-time cleanup of recorded stale managed runtimes before the next pool snapshot is marked complete
