# codex-stalled-recovery-contract Specification

## Purpose

Define the Codex-specific stalled recovery contract so waiting-first-event, silent foreground work, and request-user-input resume gaps settle into bounded, diagnosable states instead of leaving threads stuck in pseudo-processing.
## Requirements
### Requirement: Codex Stalled Turn MUST Transition To A Recoverable Degraded State

当 `Codex` queue fusion / continuation 已请求切换，但在受限窗口内没有收到新的 continuation 证据或终态事件时，系统 MUST 将其从“假继续生成”转为可恢复的 degraded state。

#### Scenario: queue fusion continuation that never resumes becomes recoverable

- **WHEN** 用户触发 Codex queue fusion
- **AND** 系统已向 runtime 发出 same-run continuation 或 cutover continuation 请求
- **AND** 在受限窗口内未收到新的 `turn/started`、stream delta、execution item 或等效推进事件
- **THEN** 系统 MUST 将当前 continuation 标记为 `resume-pending`、`resume-stalled` 或等效可恢复状态
- **AND** 线程 MUST NOT 永久停留在“继续生成中”的假活跃状态

#### Scenario: fusion continuation timeout remains bounded and diagnosable

- **WHEN** 系统对 Codex fusion continuation 执行 stalled settlement
- **THEN** timeout MUST 使用 bounded recovery window
- **AND** stalled diagnostic MUST 指明该条链路来自 same-run fusion、cutover fusion 或等效 continuation source

### Requirement: Codex Stalled Recovery Diagnostics MUST Be Correlatable Across Runtime And Thread Surfaces

针对同一条 Codex fusion stalled chain，thread-facing diagnostics、runtime diagnostics 与 runtime pool console MUST 共享一致的相关维度。

#### Scenario: stalled fusion exposes shared correlation dimensions

- **WHEN** 系统识别到 Codex fusion continuation 进入 stalled / degraded state
- **THEN** 诊断事实 MUST 至少包含 `workspaceId`、`threadId`、`turnId`（可用时）、engine、continuation source 与 timeout stage
- **AND** thread 与 runtime pool MUST 使用语义一致的 stalled reason 表达同一条异常链
