## 1. Backend lifecycle guard

- [x] 1.1 为 `WorkspaceSession` 增加 stopping / ended 可观测 helper，并在 `ensure_codex_session` 复用旧 runtime 前接入 reusable gating。[P0][输入: `src-tauri/src/backend/app_server.rs`, `src-tauri/src/backend/app_server_runtime_lifecycle.rs`, `src-tauri/src/codex/session_runtime.rs`][输出: manual-shutdown / runtime-ended session 不再被当作健康实例复用][验证: Rust 单测覆盖 stopping session 被判 stale]
- [x] 1.2 为 stopping-runtime rejection 补充 recovery/diagnostic 记录，确保 runtime log 可区分 pre-probe reject 与普通 health-probe stale。[P1][依赖: 1.1][输入: existing runtime manager diagnostics][输出: create-session shutdown race 有可关联 evidence][验证: 新增或更新 Rust 单测断言 guard/diagnostic 字段]

## 2. Create-session recovery flow

- [x] 2.1 在 `start_thread` / `start_thread_core` 链路实现一次 bounded fresh retry，命中 stopping/manual-shutdown race 时自动走 fresh reacquire 后重试一次。[P0][依赖: 1.1][输入: `src-tauri/src/codex/mod.rs`, `src-tauri/src/shared/codex_core.rs`][输出: 用户创建 Codex 会话不再直接失败于 stopping-runtime reuse][验证: Rust 单测覆盖 first attempt 命中 stopping race、second attempt 成功]
- [x] 2.2 校准 create-session failure 收口，确保 fresh retry 后仍失败时返回 recoverable 且可解释的错误，不把 stale stopping-runtime 作为唯一用户可见结论。[P1][依赖: 2.1][输入: backend error contract + frontend create-session alert path][输出: error path 与 bounded retry 语义一致][验证: Vitest 覆盖 retry exhausted 时的 create-session error 表现]

## 3. Verification and contract sync

- [x] 3.1 补齐 frontend / runtime regression tests，覆盖 `manual shutdown` 窗口下的 create-session success path 与 failure path。[P0][依赖: 2.1, 2.2][输入: thread action tests, app server event tests][输出: create-session shutdown-race regression coverage][验证: targeted Vitest + Rust tests 通过]
- [x] 3.2 运行 OpenSpec 与质量门禁，确认 proposal/design/specs/tasks、实现与测试保持一致。[P1][依赖: 3.1][输入: 新 change artifacts + code changes][输出: change 可继续 apply/verify][验证: `openspec validate --change fix-codex-session-create-shutdown-race --strict` 与相关测试命令通过]
