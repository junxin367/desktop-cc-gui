## Why

当前 Codex 创建会话链路在 `manual shutdown` 与 `thread/start` 之间存在 reuse race：旧 managed runtime 已经进入关闭流程，但 `ensure_codex_session` 仍可能把它当成健康实例复用，最终把 `创建会话失败` 暴露给用户。这个问题已经直接影响用户新建 Codex 会话的成功率，因此需要把“stopping runtime 不可复用”和“用户触发的新尝试可自动 fresh reacquire”收口成明确 contract，而不是继续依赖断开重连或重启应用兜底。

## What Changes

- 明确 Codex managed runtime 在 `manual shutdown` / `runtime ended` / `replacement stopping predecessor` 状态下不得再被 `ensure_codex_session` 视为可复用健康实例。
- 为 `new thread` / `create session` 这类 user-initiated runtime-required action 增加一次 bounded fresh reacquire/retry 路径，避免用户因为命中关闭窗口而必须手动 reconnect。
- 将 runtime lifecycle snapshot 与 recovery diagnostics 补充到 create-session failure 链路，确保 runtime pool / frontend diagnostics 能解释“为什么这次不是普通 provider error，而是 stopping-runtime reuse 被拒绝”。
- 补齐后端与前端回归测试，覆盖 `manual shutdown` 关闭窗口下的 `start_thread` 成功恢复与失败收敛。

## Capabilities

### New Capabilities

- _None_

### Modified Capabilities

- `runtime-orchestrator`: 收紧 managed runtime 的可复用边界，禁止 user action 复用已经进入 stopping/manual-shutdown 的 runtime，并要求新会话启动走 fresh successor acquisition。
- `conversation-runtime-stability`: 明确 user-initiated `new thread` / `create session` 在命中 stopping-runtime race 时必须走 bounded fresh recovery，而不是把 `manual_shutdown` 原样暴露成需要用户手工 reconnect 的普通错误。

## Impact

- Rust backend: `src-tauri/src/codex/session_runtime.rs`、`src-tauri/src/codex/mod.rs`、`src-tauri/src/shared/codex_core.rs`、`src-tauri/src/backend/app_server.rs`、`src-tauri/src/runtime/mod.rs`
- Frontend/runtime event consumption: `src/features/app/hooks/useWorkspaceActions.ts`、相关 thread/runtime diagnostics tests
- Specs/contracts: `openspec/specs/runtime-orchestrator/spec.md`、`openspec/specs/conversation-runtime-stability/spec.md`
- Validation: Rust unit tests + Vitest runtime/create-session regression coverage
