## Why

Codex 长任务在开启 follow-up fusion / same-run continuation 后，偶发进入“线程提示仍在继续生成、工具流与正文流却已停止、runtime pool 仍显示占用”的假活跃状态。这个状态既误导用户判断，也让 runtime pool 的占用信息失去诊断价值，因此需要把 fusion continuation 的收口契约补齐。

## 目标与边界

- 目标：让 Codex queue fusion / same-run continuation 在成功接续前不会过早宣称“内容正在继续生成”。
- 目标：当 fusion continuation 未接到新的 lifecycle 事件、首包或 execution item 时，线程 MUST 在有界窗口内转入 recoverable degraded state，而不是无限 loading。
- 目标：runtime pool MUST 能把这类未收口的 fusion continuation 表达成 stalled foreground work，而不是模糊 busy 或 plain idle。
- 边界：本次只聚焦 Codex 的 queued follow-up fusion / same-run continuation / safe cutover，不重做全部 queue 系统。
- 边界：不修改 pin / warm retention / budget 的基本语义；这些仍只负责 idle retention，不负责 continuation 成功保证。
- 边界：不把问题泛化为所有 provider silence；Claude、Gemini、OpenCode 仅要求不回退既有行为。

## 非目标

- 不通过单纯调大 timeout 掩盖 continuation 未接上的问题。
- 不把 runtime pool 的 retained / pinned 语义改造成“保证执行成功”。
- 不重写整个 thread lifecycle reducer 或 runtime orchestrator。
- 不在本次解决 provider 上游真正无响应、网络故障或模型超慢的所有情况。

## What Changes

- 调整 fusion 切换时的用户可见文案：在收到新的 continuation 证据前，不再乐观宣称“内容正在继续生成”。
- 为 Codex queue fusion continuation 增加 bounded settlement：
  - same-run continuation 与 cutover 在接续窗口内若无新 lifecycle 事件，系统 MUST 进入 recoverable stalled state。
  - stalled 收口 MUST 清理 pseudo-processing、释放 fusion lock，并恢复用户继续操作的能力。
- 将 fusion continuation stalled 纳入现有 runtime / thread diagnostics 与 runtime pool observability：
  - runtime pool 需要能区分 active continuation、stalled continuation 与普通 retained runtime。
  - thread-facing diagnostics 与 runtime pool snapshot 需要共享 `workspaceId`、`threadId`、`turnId`、continuation source 与 timeout stage。
- 补齐 terminal cleanup 路径，确保 completed / error / runtime-ended / recoverable abort 都能清理 fusion continuity 残留。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 仅把“继续生成”文案改成更保守的提示 | 误导感立刻下降 | 没有真正结算 stalled continuation，线程仍可能无限 loading | 不采用 |
| B | 仅在前端 fusion hook 增加超时后强制解锁 | 改动小，能止血 | backend/runtime pool 仍无共享 continuity 语义，状态继续对不上 | 不采用 |
| C | 复用现有 stalled recovery contract，为 fusion continuation 增加 bounded settlement，并对齐 runtime pool 清理 | 同时解决假活跃、卡死与占用态误导；后续可诊断 | 需要跨 frontend/backend/runtime/pool 多处收口 | 采用 |

## 验收标准

- 用户点击 queue fusion 后，系统在收到新 continuation 证据前 MUST NOT 直接显示“内容正在继续生成”这类已确认口吻。
- 当 Codex fusion continuation 在受限窗口内未收到新的 `turn/started`、stream delta、execution item 或等效推进事件时，线程 MUST 退出 pseudo-processing 并进入 recoverable degraded state。
- stalled fusion continuation MUST 清理当前线程的 fusion lock，剩余排队消息可继续操作，不得永久冻结。
- runtime pool console MUST 能区分 fusion continuation 的 stalled foreground work，与 plain idle / pinned retained runtime 不得混淆。
- completed、error、runtime-ended、recoverable abort 等终态 MUST 清理 fusion continuity 残留，不得留下“线程已停但池子仍像在忙”的脏状态。

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `composer-queued-followup-fusion`: 为 queued follow-up fusion 增加“接续成功前不得过早确认继续生成”和“接续失败时 bounded settlement”要求。
- `codex-stalled-recovery-contract`: 将 stalled continuation contract 扩展到 Codex queue fusion / same-run continuation / safe cutover 恢复链。
- `conversation-lifecycle-contract`: 修改 foreground turn recovery settlement，保证 fusion continuation 未推进时线程可 deterministically 离开 pseudo-processing。
- `conversation-runtime-stability`: 让 Codex continuation silence 进入结构化 liveness diagnostics，而不是只留下一条模糊 busy 状态。
- `runtime-pool-console`: 修改 runtime row 的 continuity 展示与清理要求，使 stalled fusion continuation 可解释、可清理、可诊断。

## Impact

- Frontend:
  - `src/features/threads/hooks/useQueuedSend.ts`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/debug/hooks/useDebugLog.ts`
- Backend / runtime:
  - `src-tauri/src/backend/app_server.rs`
  - `src-tauri/src/backend/app_server_event_helpers.rs`
  - `src-tauri/src/runtime/mod.rs`
- Specs:
  - `openspec/specs/composer-queued-followup-fusion/spec.md`
  - `openspec/specs/codex-stalled-recovery-contract/spec.md`
  - `openspec/specs/conversation-lifecycle-contract/spec.md`
  - `openspec/specs/conversation-runtime-stability/spec.md`
  - `openspec/specs/runtime-pool-console/spec.md`
- Dependencies:
  - 不新增第三方依赖；复用现有 stalled event、thread diagnostics、runtime pool snapshot 与 queue fusion 状态机
