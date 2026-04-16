## ADDED Requirements

### Requirement: Claude Code Mode Availability MUST Follow Progressive Rollout Rules

The system MUST expose Claude Code modes according to an explicit phased rollout policy rather than enabling all defined modes at once.

#### Scenario: phase one exposes only plan and full access
- **WHEN** the active provider is `Claude Code` and rollout is at Phase 1
- **THEN** UI MUST allow selecting `plan` and `bypassPermissions`
- **AND** UI MUST NOT present `default` or `acceptEdits` as available modes

#### Scenario: later phases may expand availability without changing mode ids
- **WHEN** rollout advances beyond Phase 1
- **THEN** the system MAY enable additional existing Claude modes
- **AND** it MUST continue using the existing `default / plan / acceptEdits / bypassPermissions` mode ids

### Requirement: Claude Mode Selection MUST Be Runtime-Effective

For Claude Code sessions, selected mode MUST remain a real runtime input and MUST NOT be silently overridden by product-layer defaults.

#### Scenario: selected plan mode reaches backend send payload
- **WHEN** user selects Claude `plan` mode and sends a message
- **THEN** frontend MUST send backend access mode `read-only`
- **AND** runtime MUST NOT overwrite that selection to `full-access`

#### Scenario: selected full access reaches backend send payload
- **WHEN** user selects Claude `bypassPermissions` mode and sends a message
- **THEN** frontend MUST send backend access mode `full-access`
- **AND** runtime MUST preserve that selection unchanged

### Requirement: Claude CLI Flag Mapping MUST Stay Deterministic Per Mode

Claude runtime MUST map each enabled access mode to a deterministic Claude CLI permission flag set.

#### Scenario: plan mode maps to claude read-only execution
- **WHEN** Claude runtime receives access mode `read-only`
- **THEN** it MUST launch Claude CLI with `--permission-mode plan`

#### Scenario: full access maps to skip-permissions execution
- **WHEN** Claude runtime receives access mode `full-access`
- **THEN** it MUST launch Claude CLI with `--dangerously-skip-permissions`

#### Scenario: default and accept edits remain gated until enabled
- **WHEN** Claude rollout phase does not yet allow `default` or `current`
- **THEN** user MUST NOT be able to enter those modes through normal mode selection
- **AND** runtime contract tests MUST still preserve their mapping definitions for future phases

### Requirement: Claude Approval-Dependent Modes MUST Be Gated By Approval Bridge Readiness

Modes that rely on runtime approval interaction MUST NOT be exposed as available until Claude approval requests can traverse the existing approval flow end-to-end.

#### Scenario: default mode remains unavailable before approval bridge is ready
- **WHEN** Claude approval request bridging is incomplete
- **THEN** the system MUST keep Claude `default` mode unavailable to ordinary users
- **AND** it MUST NOT advertise manual approval behavior as working

#### Scenario: accept edits remains unavailable before semantics are verified
- **WHEN** Claude `acceptEdits` semantics have not been verified against current CLI behavior
- **THEN** the system MUST keep Claude `acceptEdits` unavailable
- **AND** it MUST NOT describe the mode as stable

### Requirement: Claude Approval Bridge MUST Reuse Existing Approval Workflow

Once approval-dependent Claude modes are enabled, Claude approval requests MUST reuse the existing approval workflow instead of introducing a provider-specific confirmation path.

#### Scenario: claude approval request enters existing approval pipeline
- **WHEN** Claude runtime emits an operation that requires approval
- **THEN** the system MUST surface it through the existing approval request event flow
- **AND** user decisions MUST continue to route through the existing server request response path

#### Scenario: claude approval rejection stays diagnosable
- **WHEN** user declines a Claude approval request
- **THEN** runtime MUST return a stable rejection outcome to the active conversation
- **AND** the conversation MUST remain interactive for further user action
