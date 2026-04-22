## MODIFIED Requirements

### Requirement: Codex Runtime Silence MUST Surface Bounded Liveness Diagnostics

对于 Codex fusion continuation，系统 MUST 将“切换后无新 continuation 证据”的静默窗口视为受限 liveness 状态，而不是仅留下模糊的 busy / retained 表象。

#### Scenario: fusion continuation silence is not treated as confirmed resumed work

- **WHEN** Codex queue fusion 已向 runtime 发出 continuation 请求
- **AND** runtime 进程仍存活
- **AND** 受限窗口内没有新的 continuation 证据
- **THEN** 系统 MUST 将该状态视为 `resume-pending`、`silent-busy` 或等效 liveness 状态
- **AND** 该状态 MUST NOT 被当作已经确认 resumed 的正常 active work

#### Scenario: bounded fusion silence timeout settles to structured degraded outcome

- **WHEN** Codex fusion continuation silence 超出配置的 bounded window
- **THEN** 系统 MUST 产出结构化 degraded diagnostic
- **AND** 诊断 MUST 能区分普通 user-input resume timeout 与 fusion continuation timeout
