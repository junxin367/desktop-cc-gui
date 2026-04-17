## MODIFIED Requirements

### Requirement: Unified Cross-Engine Conversation Lifecycle Contract
The system MUST define consistent lifecycle semantics (delete, recent ordering, restart visibility, key tool card recoverability, runtime mode input handling, and approval continuity) across Claude, Codex, and OpenCode.

#### Scenario: lifecycle contract applies to all engines
- **WHEN** the system executes lifecycle-related conversation operations
- **THEN** semantics MUST remain consistent across all three engines
- **AND** engine-specific differences MUST stay inside internal adapter layers

#### Scenario: key tool card lifecycle parity across engines
- **WHEN** `commandExecution` or `fileChange` cards are produced in any engine session
- **THEN** lifecycle semantics for visibility and recovery MUST be equivalent across engines
- **AND** engine adapter differences MUST NOT leak to user-visible card continuity

#### Scenario: restart replay preserves key tool card continuity
- **WHEN** user restarts the app and reopens the same conversation
- **THEN** previously visible `commandExecution` and `fileChange` cards MUST be replayed from persisted history
- **AND** replayed card semantics MUST match pre-restart behavior

#### Scenario: runtime mode selection stays user-visible and effective
- **WHEN** user selects an engine mode that is exposed as available in conversation UI
- **THEN** that mode MUST remain a real runtime input for the target engine
- **AND** product-layer initialization MUST NOT silently override it before send

## ADDED Requirements

### Requirement: Claude Progressive Mode Rollout MUST Preserve Conversation Continuity

Claude mode availability changes MUST preserve conversation lifecycle continuity and MUST NOT require users to switch to a different engine contract.

#### Scenario: current claude mode expansion does not reset thread flow
- **WHEN** Claude exposes `default`, `plan`, and `full-access`
- **THEN** existing Claude thread creation and message send flow MUST remain continuous
- **AND** previously working `full-access` conversations MUST continue without lifecycle regression

#### Scenario: approval-dependent claude modes stay inside existing event stream
- **WHEN** Claude mode execution requires GUI approval
- **THEN** approval requests MUST flow through the existing conversation event stream
- **AND** user-visible lifecycle progression MUST remain consistent with other engines using the same approval surface

### Requirement: Claude Synthetic Approval Resume MUST Preserve History Recoverability

Claude synthetic approval handling MUST preserve both live continuity and restart recoverability.

#### Scenario: approval completion resumes the interrupted claude turn
- **WHEN** the last pending Claude synthetic approval in a turn is resolved
- **THEN** runtime MUST continue the interrupted Claude session instead of ending permanently at the approval summary
- **AND** the user MUST still receive the post-approval execution result in the same conversation flow

#### Scenario: synthetic approval markers do not leak into user-visible history
- **WHEN** approval resume metadata is carried through Claude history using an internal marker payload
- **THEN** loaders and thread item parsing MUST strip the raw marker from visible text
- **AND** the payload MUST be reconstructed into structured lifecycle items such as `File changes`

#### Scenario: multi-approval turns finalize only after the last request resolves
- **WHEN** multiple Claude approvals are pending for the same turn
- **THEN** the conversation MUST remain resumable until every pending approval is answered
- **AND** intermediate approvals MUST NOT prematurely finalize the turn
