## 1. Toast contract

- [x] 1.1 扩展 `ErrorToast` contract 与 `ErrorToasts` 渲染层，支持 optional action button、pending label 与 inline action error。[P0][输入: `src/services/toasts.ts`, `src/features/notifications/components/ErrorToasts.tsx`, `src/features/notifications/hooks/useErrorToasts.ts`, `src/styles/error-toasts.css`][输出: app-level error toast 可承载 async 恢复动作][验证: Vitest 覆盖 action render + pending/error]

## 2. Create-session recovery action

- [x] 2.1 在 `useWorkspaceActions` 中把 recoverable create-session failure 改为 action toast，而不是普通 alert。[P0][依赖: 1.1][输入: `src/features/app/hooks/useWorkspaceActions.ts`][输出: recoverable error 出现“重连并重试创建”动作][验证: hook test 断言 push toast 而非 alert]
- [x] 2.2 让恢复动作复用 `ensureRuntimeReady -> retry create session` 链路，并为 action label/pending 文案补齐 i18n。[P1][依赖: 2.1][输入: `src/services/tauri.ts`, `src/i18n/locales/*`][输出: action 行为与文案完整闭环][验证: Vitest 覆盖 action callback 成功/失败]
- [x] 2.3 在 runtime reconnect 成功后追加短暂的恢复中提示，让用户知道系统正在重新创建会话。[P1][依赖: 2.2][输入: `src/features/app/hooks/useWorkspaceActions.ts`, `src/services/toasts.ts`, `src/i18n/locales/*`][输出: action 成功后有显性的 recovery-progress feedback][验证: hook/component tests 断言 info toast 文案与 variant]

## 3. Verification

- [x] 3.1 运行 targeted Vitest 与 OpenSpec validate，确认新 toast 恢复动作与既有 create-session contract 一致。[P1][依赖: 2.2][输入: 新增测试 + change artifacts][输出: change ready for apply/verify][验证: `npx vitest run ...` + `openspec validate add-create-session-recovery-toast-action --strict`]
