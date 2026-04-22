## Context

当前 `useWorkspaceActions.handleAddAgent` 在 create-session 失败时只有两种表现：

1. 普通失败：`alert(failedToCreateSession + detail)`
2. recoverable stopping-runtime failure：仍然只是另一条文案更友好的 `alert(...)`

这导致系统虽然知道“这类错误本质上可以通过 reconnect + retry 恢复”，但前端没有把这层语义转成动作。另一方面，app-shell 已经有一套全局 `ErrorToasts` surface，可以承载显性的恢复按钮，比继续扩展系统 `alert`/`ask` 更符合项目现有模式。

## Goals / Non-Goals

**Goals**

- 让 recoverable create-session failure 通过 app-level toast 暴露显性恢复动作。
- 保证恢复动作只复用现有 runtime recovery contract，不新增另一套旁路 reconnect 逻辑。
- 保持普通错误路径不变，避免把所有 create-session failure 都改造成 toast。
- 让 toast action 支持 async pending/error feedback，避免“点了按钮但没有反馈”。

**Non-Goals**

- 不重做全部 error toast 视觉体系。
- 不把所有 error toast 都改成 action toast。
- 不替换消息区已有 `RuntimeReconnectCard`；本次只覆盖 create-session 前后的 app-level错误。

## Decisions

### Decision 1: 复用 app-level ErrorToasts，而不是引入新的 modal/dialog

`ErrorToasts` 已经是 app-shell 的全局错误承载层，适合放置“创建会话失败，但可以恢复”的动作入口。相比再做一个 feature-local modal：

- 更贴近当前交互上下文，不会强制打断用户。
- 可以保留失败信息和操作按钮在同一 surface。
- 改动范围小，只需扩展 toast contract 和渲染层。

### Decision 2: 仅对 recoverable create-session failure 投递 action toast

`useWorkspaceActions` 会继续区分：

- empty thread id / 普通 provider error：维持现有 alert
- `[SESSION_CREATE_RUNTIME_RECOVERING]` / stopping-runtime recoverable error：投递 action toast

这样不会把 toast 扩散成 create-session 的默认失败承载层，只处理真正值得“就地恢复”的那一类错误。

### Decision 3: toast action 走 `ensureRuntimeReady -> retry create session`

恢复动作必须与消息区 runtime reconnect 一致，优先调用 `ensureRuntimeReady(workspaceId)`，然后重新执行 create-session flow。这样可以复用既有 runtime guard/diagnostics，而不是在前端手搓“disconnect/reconnect/start-thread”的分叉逻辑。

### Decision 4: ErrorToast action 需要有 async pending/error state

如果 action button 没有 pending/error 反馈，用户会感觉“点了没反应”。因此 toast contract 需要允许：

- `label`
- `pendingLabel`
- `run(): Promise<void> | void`

渲染层在 action 进行中禁用按钮，并在 action 抛错时展示 inline detail。

## Risks / Trade-offs

- [Risk] 扩展通用 `ErrorToast` contract 可能影响现有只读 toast。  
  Mitigation: 所有新增字段都保持 optional，旧调用点不需要修改。

- [Risk] 恢复动作失败后 toast 可能堆叠重复。  
  Mitigation: action 成功后 dismiss 当前 toast；失败时优先在当前 toast 内展示 detail，由 `useWorkspaceActions` 决定是否再发新 toast。

- [Risk] `ensureRuntimeReady` 与 create-session flow 都会触发 loading UI，可能带来双重反馈。  
  Mitigation: 允许 toast action只负责恢复逻辑，实际 create-session 继续使用既有 loading progress dialog。

## Validation Plan

- Vitest: `useWorkspaceActions.test.tsx` 覆盖 recoverable failure 改为 toast 且 action callback 可执行。
- Vitest: `ErrorToasts` 覆盖 action button、pending label、action error render。
- OpenSpec validate for this new change.
