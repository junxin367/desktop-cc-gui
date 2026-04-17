## Why

`Claude Code` 模式最初按“渐进式 rollout”设计，但代码已经明显走到了下一阶段：`plan` 与 `full-access` 已稳定可用，`default` 也不再只是文案 preview，而是已经进入真实 `File changes` 审批链路，并通过 synthetic approval bridge 复用了现有 GUI approval 交互。

如果继续保留旧提案里“approval bridge 尚未接入”“default 仍停留 preview 占位”的表述，会导致 OpenSpec 与代码事实脱节，后续验证、回归和继续开放 `acceptEdits` 都会失去可靠基线。因此本次需要基于现有实现回写 proposal，把“已完成能力”“剩余边界”“下一阶段待办”明确下来。

## 目标与边界

### 目标

- 回写 Claude mode rollout 的当前真实阶段，而不是继续停留在最初规划态。
- 明确当前已落地的能力：
  - `plan` / `full-access` 的稳定模式透传
  - `default` 的真实 synthetic approval bridge
  - 多文件审批后的继续执行与 resume continuity
  - 历史恢复中的 synthetic approval marker stripping / card replay
  - Windows / nested path 下的本地文件 apply 边界修复
  - large-file governance 触发后的 `claude.rs` 模块拆分
- 明确当前仍未完成的边界：
  - `acceptEdits` 尚未开放
  - Claude 原生命令审批与更完整 CLI approval shape 仍待继续收敛

### 边界

- 本提案仅覆盖 `Claude Code` 模式及其相关 conversation lifecycle，不改变 `Codex`、`Gemini`、`OpenCode` 的 provider 行为。
- 本提案是“按代码回写”，不是重新设计一套新模式系统。
- 本轮不引入新的 mode ids，继续沿用 `default / plan / acceptEdits / bypassPermissions` 与 `AccessMode` 既有映射。
- 本轮不重做整套审批 UI，只要求 Claude 复用现有 approval/request 主链路。

## 非目标

- 不在本轮承诺一次性开放 `acceptEdits`。
- 不在本轮重构 Claude provider / auth / vendor 配置。
- 不在本轮引入第二套 Claude 专属审批浮层。
- 不在本轮消化所有 Claude CLI event 差异，只收敛已经被代码和手测验证的主路径。

## What Changes

- 把 Claude rollout 当前阶段更新为“`default` 已进入可用阶段，但仍保留 preview / bounded support 语义”，而不是“仅 Phase 1 开放 `plan/full-access`”。
- 明确 `default` 当前通过 synthetic approval bridge 复用现有 approval 流程：
  - runtime 将 Claude file permission denial 识别并转成 GUI approval request
  - 前端审批弹窗可以逐条审批，也支持本次批量审批
  - 审批完成后线程不会停在 summary，而会继续 resume Claude 会话
- 明确 conversation continuity 约束已经扩展到 Claude synthetic approval：
  - 用 `<ccgui-approval-resume>...</ccgui-approval-resume>` marker 在 resume 时回灌批准结果
  - history loader 会把 marker 剥离成结构化 `File changes` 卡片，避免历史噪音
  - reducer 用更完整的 approval identity 去重/删除，避免只按 `request_id` 造成竞态
- 明确当前 synthetic local apply 的边界：
  - 支持 `Write` / `CreateFile` / `CreateDirectory`
  - 支持缺失父目录创建
  - 支持 Windows / macOS 路径归一化与 workspace 越界防护
- 把 large-file governance 的实际治理结果写入 proposal：
  - `src-tauri/src/engine/claude.rs` 已拆分出 `claude/approval.rs`、`claude/manager.rs`、`claude/tests_stream.rs`
  - `claude.rs` 已降到 3000 行门禁内

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续沿用旧 proposal，只把代码当实现细节 | 变更最少 | OpenSpec 与代码事实失真，后续验收标准不可用 | 不采用 |
| B | 重新起一个新 change 专门描述 synthetic approval bridge | 文档更纯粹 | 会把同一 rollout 的上下文切碎，追踪成本更高 | 不采用 |
| C | 在现有 change 上按代码回写当前阶段，保留“已完成 + 剩余阶段”结构 | 行为、设计、任务、验收能重新对齐 | 需要同步更新 proposal/design/tasks/spec | **采用** |

## Capabilities

### Modified Capabilities

- `claude-code-access-modes`
- `conversation-lifecycle-contract`

### Capability Focus

- Claude mode selection 必须继续保持 runtime-effective，不得被产品层静默改写。
- Claude approval-dependent mode 已从“future bridge”升级为“已有 synthetic approval bridge，但能力有边界”。
- Conversation lifecycle 必须承认 synthetic approval resume marker、历史恢复和多次审批后的继续执行。

## 验收标准

- `Claude` provider 下：
  - `plan` 继续映射只读执行
  - `full-access` 继续映射跳过权限检查
  - `default` 已可进入真实文件审批路径，不再只是文案占位
  - `acceptEdits` 仍保持未开放，直到 CLI 语义完成验证
- Claude `default` 命中受支持的文件变更时：
  - GUI 必须收到 approval request
  - 用户批准后本地文件变更被实际应用
  - 多个文件审批完成后会话必须继续 resume，而不是直接结束
- Claude history replay 时：
  - synthetic approval marker 不得原样泄漏到用户文本
  - 仍需恢复为结构化 `File changes` 卡片
- approval reducer 不得只按单一 `request_id` 删除，必须避免多审批并发误删
- `npm run check:large-files:gate` 必须继续通过，`claude.rs` 不得重新越过 3000 行门槛

## Impact

- Affected frontend:
  - `src/features/threads/hooks/useThreadApprovals.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - `src/features/threads/loaders/claudeHistoryLoader.ts`
  - `src/utils/threadItems.ts`
- Affected backend/runtime:
  - `src-tauri/src/engine/claude.rs`
  - `src-tauri/src/engine/claude/approval.rs`
  - `src-tauri/src/engine/claude/manager.rs`
  - `src-tauri/src/engine/claude/tests_stream.rs`
- Affected validation:
  - Claude approval / resume / history continuity tests
  - `npm run check:large-files:gate`
