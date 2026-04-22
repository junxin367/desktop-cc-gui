## Why

上一轮修复已经让 `create session` 在 stopping-runtime race 下尽量自动自愈，并把最终失败收敛成稳定的 recoverable error contract；但前端当前仍然只会给用户展示一条错误文本。对于这类“系统已识别为可恢复”的失败，用户需要一个就地、显性的恢复入口，而不是再自己回想“应该去重连再试一次”。

## What Changes

- 为 app-level `error toast` 增加可选 action button 能力，使 recoverable error 可以承载显性恢复动作。
- 当 `create session` 命中 `[SESSION_CREATE_RUNTIME_RECOVERING]` 或等价 stopping-runtime recoverable failure 时，前端不再只弹普通 alert，而是展示一个带“重连并重试创建”动作的恢复 toast。
- 恢复动作必须复用现有 runtime recovery contract：先 `ensureRuntimeReady`，再重试一次 create-session flow。
- 补齐 toast action 与 create-session recovery 的前端回归测试。

## Capabilities

### New Capabilities

- _None_

### Modified Capabilities

- `conversation-runtime-stability`: 对 recoverable create-session failure 增加显性 UI 恢复动作，要求用户可以从错误 surface 直接触发 reconnect + retry，而不是只能手工重试。

## Impact

- Frontend hooks/components: `src/features/app/hooks/useWorkspaceActions.ts`、`src/features/notifications/components/ErrorToasts.tsx`
- Frontend state/toast contract: `src/services/toasts.ts`、`src/features/notifications/hooks/useErrorToasts.ts`
- Styling/i18n: `src/styles/error-toasts.css`、`src/i18n/locales/*`
- Validation: Vitest for toast action rendering + create-session recovery flow
