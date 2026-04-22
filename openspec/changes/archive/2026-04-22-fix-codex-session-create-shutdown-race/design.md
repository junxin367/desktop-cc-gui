## Context

当前 Codex create-session 链路是：

`useWorkspaceActions -> startThreadForWorkspace -> start_thread (Tauri) -> ensure_codex_session -> start_thread_core -> thread/start`

问题出在 `ensure_codex_session` 的“复用旧 session”判断只依赖 health probe。对于已经进入 `manual shutdown`、`runtime_end_emitted` 或 replacement predecessor stop 窗口的 managed runtime，这个 probe 仍可能在极短时间内成功，于是系统把一个“正在退出的 runtime”继续当成可复用实例，随后 `thread/start` 被 `manual_shutdown` 终止，前端直接弹出“创建会话失败”。

这个问题是标准 cross-layer race：

- backend runtime/session lifecycle 负责 runtime 可复用性判定；
- `start_thread` 是用户最显式的 runtime-required action；
- frontend 当前只会把底层字符串错误直接 alert 给用户，缺少“这次是 shutdown race 还是普通 provider failure”的语义区分。

约束：

- 不能打破现有 `workspace + engine` recovery guard。
- 不能把自动恢复扩散成所有 RPC 的无界重试。
- 不能让 stopping predecessor 再次参与 active runtime 复用判断。
- 要保留 runtime log / diagnostics 的可关联证据。

## Goals / Non-Goals

**Goals:**

- 为 `WorkspaceSession` 增加显式的 stopping / ended 可观测状态，使 create-session 复用判断不再只依赖 health probe。
- 保证 `manual shutdown`、`runtime_end_emitted`、replacement stopping predecessor 这类 runtime 不会再被 `ensure_codex_session` 当作健康实例复用。
- 为用户触发的 `new thread` / `create session` 增加一次 bounded fresh reacquire/retry，避免用户必须先手动 reconnect。
- 保持 recovery evidence 可诊断，让 runtime pool / frontend debug 能解释 fresh retry 的触发原因与最终结果。
- 用最小范围补齐 Rust + frontend 回归测试，覆盖这个 shutdown race。

**Non-Goals:**

- 不重写整个 runtime guard / quarantine / cooldown 模型。
- 不把所有 Codex RPC 都变成“失败就自动重试”。
- 不在本次改动里重做 create-session 用户提示文案或设置页交互。
- 不引入新的持久化 incident storage。

## Decisions

### Decision 1: 复用判定要先看 session lifecycle guard，而不是只看 health probe

在 `WorkspaceSession` 上增加只读 lifecycle helpers，例如：

- `is_manual_shutdown_requested()`
- `runtime_end_emitted()`
- `is_reusable_runtime_candidate()`

`ensure_codex_session` 复用现有 session 时先判断这些 flags；命中 stopping / ended 状态时，直接按 stale session 处理并走 stop + fresh acquire，而不是继续 probe。

选择原因：

- 这是最贴近根因的位置，能阻止“正在退出的 runtime 被误复用”。
- in-memory flag 已经存在，读取成本低，不需要再引入额外 pid/OS probe。

Alternatives considered:

- 方案 A：继续只靠 `model/list` / health probe 判活。  
  不足：无法识别“还能回包，但已经进入 shutdown path”的窗口，正是本次事故根因。
- 方案 B：额外做进程状态 / pid tree probe 后再决定是否复用。  
  不足：更重、更慢，而且仍不如直接消费现有 manual-shutdown / runtime-ended 状态可靠。

### Decision 2: user-triggered `start_thread` 只做一次 bounded fresh retry，不做通用无限兜底

在 `start_thread` 链路上增加“stopping-runtime race recovery”：

1. 先正常执行 `ensure_codex_session + thread/start`
2. 如果返回的错误明确命中 `manual shutdown` / runtime-ended stopping race
3. 触发一次 fresh `ensure_codex_session`
4. 仅重试一次 `thread/start`

选择原因：

- 用户点击“创建会话”时，最合理的系统行为是自动跨过正在关闭的旧 runtime。
- 只重试一次可以保留 bounded recovery，不会和既有 guard 冲突。
- 把自动 fresh retry 限定在 user-triggered create-session，不会污染普通 background read / list / refresh 流程。

Alternatives considered:

- 方案 A：只在 `ensure_codex_session` 收紧复用边界，不在 `start_thread` 做 retry。  
  不足：如果 race 发生在 ensure 之后、`thread/start` 之前，用户仍会直接看到失败。
- 方案 B：把所有 Codex request 都统一做 fresh retry。  
  不足：范围过大，容易和现有 recovery guard、pending request 语义冲突。

### Decision 3: runtime observability 要保留“stopping predecessor rejected”证据

当系统因为 stopping/manual-shutdown 状态拒绝复用旧 session 时，要记录 source-aware diagnostic：

- recovery source
- whether stale session was rejected before probe or after request failure
- whether bounded fresh retry happened
- final success/failure

这些证据继续复用现有 runtime log / debug surface，不新增新存储。

选择原因：

- 这类问题本质上是 lifecycle race，没有证据就容易再次退化成“用户说偶现创建失败”。
- 现有 runtime diagnostics 已经有 recovery source / exit reason / guard state，扩展成本低。

Alternatives considered:

- 方案 A：仅修行为，不补 diagnostics。  
  不足：后续再出现相邻 race 时，很难区分“reuse bug”与“provider exit”。
- 方案 B：单独新增一套 incident storage。  
  不足：超出本次范围，复杂度不成比例。

## Risks / Trade-offs

- [Risk] stopping flag 读取过早，可能把其实仍可安全复用的 runtime 过度视为 stale。  
  Mitigation: 仅将 `manual_shutdown_requested` / `runtime_end_emitted` / stopping predecessor 视为硬拒绝条件，不扩大到普通 transient health probe 波动。

- [Risk] `start_thread` fresh retry 与既有 recovery guard 叠加，导致重复 acquire。  
  Mitigation: 重试仍复用既有 `ensure_codex_session` guard，只增加 user-triggered fresh cycle source，不新增旁路 spawn。

- [Risk] manual-shutdown error 字符串匹配过脆，后续文案变化可能漏判。  
  Mitigation: 优先使用结构化状态或统一 helper 判定 stopping-runtime race，避免在多个入口散落字符串匹配。

- [Risk] 只修 `start_thread` 仍可能留下 `resume_thread` 等入口的同类窗口。  
  Mitigation: 本 change 先锁定用户可见最痛的 create-session 入口，同时在 design 中要求 helper 可复用，方便后续扩展。

## Migration Plan

1. 在 OpenSpec delta specs 中更新 `runtime-orchestrator` 与 `conversation-runtime-stability` contract。
2. backend 为 `WorkspaceSession` 增加 reusable/stopping lifecycle helpers。
3. 收紧 `ensure_codex_session` 的 reuse gating，禁止复用 stopping/manual-shutdown runtime。
4. 在 `start_thread` 链路加入 bounded fresh retry，并补 diagnostics。
5. 补 Rust 单测与前端 create-session 回归测试。
6. 运行 targeted tests、typecheck 与相关 runtime contract checks。

Rollback strategy:

- 若 bounded retry 行为有副作用，可先保留 reuse gating，只回退 `start_thread` retry；
- 若 lifecycle helper 误判，可先放宽 helper，但保留 diagnostics 以继续观察；
- 本 change 不涉及数据迁移，回滚仅需代码回退。

## Open Questions

- `resume_thread`、`send_user_message` 是否也应该复用同一个 stopping-race helper，还是先只覆盖 `start_thread`？
- stopping-runtime rejection 是否需要在 runtime pool snapshot 中增加更明确的 last-reject reason 字段，还是现有 guard/exit diagnostics 已足够？
