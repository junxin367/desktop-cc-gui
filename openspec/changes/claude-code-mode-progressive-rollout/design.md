## Context

当前 `Claude Code` rollout 已不再停留在“只开放 `plan/full-access`”的阶段。代码已经形成一条可运行的 synthetic approval bridge，用来把 Claude 在 `default` 模式下触发的文件权限阻塞接入现有 GUI approval 流程，并在审批后继续 resume 会话。

当前真实状态可以拆成两层：

- 已稳定能力
  - `plan` -> `read-only` -> `--permission-mode plan`
  - `full-access` -> `--dangerously-skip-permissions`
  - `default` 可触发真实文件审批路径，并在审批后继续执行
- 仍待继续收敛
  - `acceptEdits` 未开放
  - Claude 更广义的原生命令审批 shape 仍未完全标准化
  - synthetic local apply 当前只覆盖受支持的文件工具

因此本 design 不再描述“未来可能接 bridge”，而是聚焦当前 bridge 的结构、边界和后续扩展约束。

## Goals / Non-Goals

**Goals**

- 记录 Claude `default` 当前 synthetic approval bridge 的真实架构。
- 记录多文件审批、resume continuity、历史恢复去噪的契约。
- 记录 approval identity 去重/删除的边界，避免再次出现 request race。
- 记录 large-file governance 触发后的模块拆分结果，为继续演进保留结构边界。

**Non-Goals**

- 不设计第二套 Claude 专属审批 UI。
- 不把 synthetic approval 泛化成全部 Claude tool 的通用执行框架。
- 不在本轮确认 `acceptEdits` 最终语义。

## Decisions

### Decision 1: `default` 通过 synthetic approval bridge 接入现有审批主链

**Decision**

- 当 Claude `default` 模式下的受支持文件工具命中 permission denial / approval-required 形态时，runtime 生成 synthetic approval request，并复用现有 GUI approval 流程。

**Why**

- 用户已经验证 Claude 本地 CLI 在某些场景会出现“本地 CLI 有授权提示，但 GUI 里没有弹窗”的缺口。
- 直接把问题留在自然语言报错层，会让 `default` 成为“看起来可用、实际不可控”的半残模式。
- 现有 approval toast、request response、thread approval state 已经足够承接 Claude file change 审批，不需要再做第二条链。

**Implementation shape**

- Runtime 识别 Claude file tool 的阻塞信号并保留 tool metadata。
- `src-tauri/src/engine/claude/approval.rs` 负责：
  - request id 归一化
  - synthetic summary 聚合
  - local file apply
  - resume message 构造
  - pending approval bookkeeping
- 前端继续沿用 `useThreadApprovals.ts` 做审批提交与批量审批。

### Decision 2: 审批后的继续执行采用 kill + `--resume` continuity，而不是停在 summary

**Decision**

- 批准文件变更后，Claude 会话不能只结束在“已批准”摘要，而必须继续回到原会话流。
- 实现方式是保存 per-turn approval summary，在审批完成后构造 resume message，并通过 `--resume` 继续 stdout processing。

**Why**

- 用户反馈的关键体验问题不是“有没有审批框”，而是“审批后执行断了、没有继续告诉我结果”。
- 单纯在审批完成时发一个 `turnCompleted` 摘要，无法满足连续对话体验。

**Implementation shape**

- `approval_notify_by_turn` / `approval_resume_message_by_turn` 作为 per-turn 同步原语。
- 当一个 turn 还有 pending approvals 时，runtime 等待。
- 最后一个 approval resolve 后：
  - 聚合 summary
  - 写入 resume message
  - 唤醒等待中的 turn
- Claude 通过 `--resume <session_id>` 回到同一会话继续处理。

### Decision 3: synthetic approval 结果通过 marker 协议穿过历史层，再在 loader 中还原成结构化卡片

**Decision**

- 审批后的 resume 文本中嵌入 `<ccgui-approval-resume>...</ccgui-approval-resume>` marker。
- 历史恢复与 thread item 解析阶段必须剥离 marker，并重新生成结构化 `File changes` 卡片。

**Why**

- 需要一个对 Claude CLI 文本流足够稳的 carrier，把“审批已完成的结构化摘要”带过 resume 与 history replay。
- 如果直接把 resume 摘要暴露在文本历史里，会制造明显噪音。

**Implementation shape**

- `approval.rs` 负责 marker 格式化。
- `src/utils/threadItems.ts` 负责 marker 识别与 strip。
- `src/features/threads/loaders/claudeHistoryLoader.ts` 负责把 marker payload 重建为 synthetic approval items。

### Decision 4: approval request 的 identity 匹配必须包含完整审批指纹，而不是只按 `request_id`

**Decision**

- reducer 中 approval 去重与移除必须按更完整的 request identity 比较，不能只按 `request_id`。

**Why**

- 用户实测中过多文件变更会同时弹多个审批，早期实现只按 `request_id` 做移除时容易误删、漏删或把后续审批链截断。
- Claude synthetic approvals 与其他引擎 approval 共享同一 reducer 时，更需要稳的 identity 规则。

**Implementation shape**

- `useThreadsReducer.ts` 中 `isSameApprovalRequest` 作为统一比较入口。
- 删除逻辑优先尝试完整 approval object 匹配，再退到兼容路径。

### Decision 5: local file apply 只支持受控工具集合，并在 workspace/path 层做强边界检查

**Decision**

- 当前 synthetic local apply 只支持 `Write` / `CreateFile` / `CreateDirectory`。
- 所有路径必须做 workspace 内约束、空路径校验、父目录创建和平台无关归一化。

**Why**

- 当前目标是把 GUI approval 补成可用，不是把全部 Claude tool 执行器重做一遍。
- file apply 是高风险路径，必须先把路径安全和跨平台行为收紧。

**Implementation shape**

- `normalize_claude_workspace_relative_path` 处理 `/` 与 `\\` 兼容。
- 对空路径、越界路径、缺元数据路径直接拒绝。
- 接受批准时自动创建缺失父目录，兼容 Windows / macOS。

### Decision 6: large-file governance 通过模块拆分维持 Claude runtime 的可维护性

**Decision**

- 当 `src-tauri/src/engine/claude.rs` 逼近并越过 3000 行门槛时，按职责拆分：
  - `claude/approval.rs`
  - `claude/manager.rs`
  - `claude/tests_stream.rs`

**Why**

- synthetic approval bridge 带来了更多状态与测试，不拆分会持续侵蚀 `claude.rs` 的可读性和门禁通过率。

**Implementation shape**

- `claude.rs` 保留 runtime 主流程与 glue logic。
- approval 相关状态机、resume marker、local apply 收敛进 `approval.rs`。
- stream / resume tests 独立到 `tests_stream.rs`。

## Risks / Trade-offs

- [Risk] synthetic approval 当前只覆盖文件工具，命令审批仍可能退化
  - Mitigation: 保持 `acceptEdits` 未开放，并继续把 Claude command approval 视为后续阶段工作。

- [Risk] resume 依赖 marker 协议，若 marker 泄漏到用户历史会产生噪音
  - Mitigation: loader 和 thread item parser 必须先 strip 再渲染。

- [Risk] 多审批并发时可能再次出现 identity race
  - Mitigation: 所有 add/remove/update 统一走完整 approval fingerprint。

- [Risk] 本地文件 apply 属于高风险写路径
  - Mitigation: 仅支持有限工具；拒绝 workspace 外路径；拒绝空路径；拒绝缺元数据请求。

- [Trade-off] synthetic bridge 并不等价于 Claude CLI 原生审批体验
  - 这是有意取舍。当前优先级是让 GUI 中的 `default` 可解释、可继续执行、可历史恢复，而不是等待 CLI 事件完美统一后再开放。

## Validation Matrix

### Runtime / approval

- Claude `default` 触发受支持文件变更时，应发出 synthetic approval request。
- 批准单个文件变更后，应完成本地写入并发出 completion / resume。
- 批准多个文件变更后，应只在最后一个批准完成时 finalize turn，并继续 resume。
- 拒绝文件变更时，不得写文件，且会话仍可继续交互。

### History / lifecycle

- synthetic approval resume marker 不得直接显示在历史消息中。
- 重开线程后，应恢复结构化 `File changes` 卡片。
- 批准后的中间态应可见，避免“点击后无反馈”的体验断层。

### Edge cases

- 空路径、workspace 外路径、缺失 tool metadata、未知 request id 必须被拒绝。
- Windows 风格路径、嵌套目录路径必须正确归一化并可写入。
- 多个 approval 并发时，不得只处理第一个请求。

### Governance

- `npm run check:large-files:gate` 必须通过。
- `src-tauri/src/engine/claude.rs` 需保持在 3000 行门槛内。

## Open Questions

- Claude 原生命令审批 event shape 是否可以进一步标准化到现有 approval request contract。
- `acceptEdits` 在当前 CLI 版本下是否真的满足“文件自动通过、命令保留审批”的产品语义。
- synthetic approval bridge 是否需要继续扩展到更多文件工具，例如 `MultiEdit` 等复杂写操作。
