## MODIFIED Requirements

### Requirement: Rendered User Sections SHALL Pin During Realtime Processing

The conversation canvas SHALL use the same condensed sticky header and physical handoff model as history browsing while the active turn is processing.

#### Scenario: rendered user sections hand off sticky ownership during realtime processing
- **WHEN** a conversation is processing in realtime
- **AND** multiple ordinary user question sections are present in the rendered message window
- **AND** one of those sections becomes the most recent section whose source row has reached the top boundary of the message viewport
- **THEN** the system SHALL pin that section using the same condensed sticky header model used for history browsing
- **AND** subsequent realtime content SHALL continue scrolling underneath it

#### Scenario: users can scroll back to earlier rendered sections during realtime processing
- **WHEN** a conversation is processing in realtime
- **AND** the user scrolls upward to review an earlier rendered ordinary user question section
- **THEN** the sticky header SHALL hand off to that earlier rendered section using physical scroll position
- **AND** it SHALL NOT switch early before that section reaches the top boundary

#### Scenario: realtime window trimming still preserves the latest current-turn source row
- **WHEN** the latest ordinary user question would otherwise be trimmed out of the live render window
- **THEN** the system SHALL keep that user row renderable enough for sticky-boundary calculation
- **AND** the realtime sticky header SHALL still be able to hand off to that latest question once its source row reaches the top boundary

### Requirement: User Question Pinning SHALL Recover To Normal Scrolling Outside Realtime

The conversation canvas SHALL stop using realtime-only sticky guarantees whenever the view is no longer the active realtime turn.

#### Scenario: history sticky contract takes over after processing completes
- **WHEN** the active conversation turn stops processing
- **THEN** the realtime-specific sticky contract SHALL stop applying
- **AND** any remaining sticky behavior SHALL be governed by the history sticky contract
- **AND** the message order and payload SHALL remain unchanged

#### Scenario: restored history defers to history sticky behavior
- **WHEN** the user opens or queries a restored conversation history view
- **THEN** realtime latest-user-question pinning SHALL NOT render its own separate sticky wrapper or header
- **AND** any visible sticky behavior SHALL be governed by the history sticky contract

### Requirement: User Question Pinning SHALL Be Display-Only

The pinning behavior SHALL remain a presentation-layer state and SHALL NOT mutate conversation data, copy text, or runtime contracts.

#### Scenario: copy remains bound to original user message display text
- **WHEN** the latest user question is represented by the realtime sticky header
- **AND** the user copies that message from its original row
- **THEN** the copy action SHALL use the existing user message display text
- **AND** the sticky presentation SHALL NOT alter the copied content

#### Scenario: runtime and history contracts remain unchanged
- **WHEN** realtime latest-user-question pinning is active
- **THEN** the system SHALL NOT require new Tauri commands, storage fields, runtime events, or history loader payload fields
