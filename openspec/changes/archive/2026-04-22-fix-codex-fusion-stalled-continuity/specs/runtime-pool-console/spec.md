## MODIFIED Requirements

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
