## Why

当前 `Claude Code` 模式在产品层面实际上被收敛成“仅全自动可选”，这与 UI 中已经存在的四种模式语义、Claude CLI 本身支持的 permission modes、以及用户对风险可控执行的预期不一致。现在继续把所有用户都压在单一 `full-access` 路径上，既掩盖了 `Claude` 权限审批链路的真实缺口，也阻碍后续按风险逐步开放能力。

这个问题现在必须处理，因为现有代码已经同时具备了模式枚举、前后端 access mode 映射、Claude CLI mode flag 映射三套基础设施，但产品 wiring 仍将模式强制钉死在 `full-access`。如果不尽快补齐渐进式开放方案，后续每次暴露 Claude 模式能力都会重复踩中“UI 有语义、运行时无保证、审批链不完整”的系统性问题。

## 目标与边界

### 目标

- 建立 `Claude Code` 模式的渐进式开放策略，明确哪些模式可先启用，哪些模式必须等审批桥补齐后再开放。
- 取消当前“前端强制 `full-access`”这一产品层短路行为，让用户选择能够真正传递到 Claude runtime。
- 首期优先保证 `plan` 与 `full-access` 两档行为可解释、可验证、可回退。
- 为后续开放 `default` 与 `acceptEdits` 预留清晰的运行时合同、审批事件合同与验证门禁。

### 边界

- 本提案只覆盖 `Claude Code` 模式，不改变 `Codex`、`Gemini`、`OpenCode` 的模式行为。
- 首期不要求一次性开放全部四种模式；允许分阶段交付。
- 首期不重做整套 Mode Selector 视觉，仅允许做必要的启用态、禁用态与文案校准。
- 首期不引入新的全局设置入口；模式状态沿用现有 composer / thread 启动链路。
- 涉及审批事件的实现必须复用现有 approval/request UI 流程，不新增第二套审批交互。

## 非目标

- 不在本轮重构整个聊天输入框架构。
- 不在本轮修改 Claude provider、auth token、base URL 等 vendor 配置逻辑。
- 不在本轮引入新的权限模型命名体系；继续沿用现有 `default / read-only / current / full-access` 与 UI `default / plan / acceptEdits / bypassPermissions` 对照关系。
- 不在本轮承诺修复所有 Claude CLI 差异，只聚焦模式开放与审批桥接缺口。

## What Changes

- 移除当前产品层面对 `Claude Code` 模式的强制 `full-access` 锁定，恢复模式选择向 runtime 的真实透传。
- 将 `Claude Code` 模式开放定义为三阶段：
  - Phase 1：开放 `plan` 和 `full-access`，保持 `default` / `acceptEdits` 禁用。
  - Phase 2：补齐 Claude 审批请求到现有前端 approval 流程的桥接，开放 `default`。
  - Phase 3：在 `default` 稳定后开放 `acceptEdits`，并验证“自动文件编辑 + 命令审批”的语义与 Claude CLI 一致。
- 新增对 Claude 模式可用性的显式产品规则：
  - `plan` 必须映射到只读执行。
  - `full-access` 必须映射到跳过权限检查。
  - `default` 与 `acceptEdits` 在审批桥未完成前不得对用户宣称可用。
- 调整模式选择器的 provider-specific 可选策略，不再把 Claude 非 `bypassPermissions` 模式一律置灰。
- 为 Claude 模式开放增加跨层验证门禁：
  - UI mode -> frontend access mode
  - frontend access mode -> Rust send params
  - Rust send params -> Claude CLI flags
  - Claude CLI approval request -> app approval toast / response flow

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 直接一次性开放四种模式 | UI 一步到位，看起来最完整 | `default/acceptEdits` 依赖审批桥，当前能力不完整，容易把问题直接暴露给用户 | 不采用 |
| B | 仅继续保留 `full-access` | 风险最低，不需要补新逻辑 | 持续隐藏真实缺口，模式 UI 与实际行为长期不一致，无法支持谨慎用户 | 不采用 |
| C | 渐进式开放：先 `plan/full-access`，再 `default`，最后 `acceptEdits` | 风险可控，符合当前能力边界，便于逐阶段验证和回退 | 需要补阶段性门禁与文档，交付节奏更细 | **采用** |

取舍结论：采用方案 C。原因是现有代码已经具备 mode mapping 基础能力，但 `Claude` 审批桥未完整接入。渐进式开放能最大化复用现有代码，同时避免把“看起来能选、实际上不能跑”的模式提前暴露给用户。

## Capabilities

### New Capabilities

- `claude-code-access-modes`: 定义 Claude Code 在 UI、runtime、CLI flag、approval flow 四层的一致模式合同，以及分阶段开放规则。

### Modified Capabilities

- `conversation-lifecycle-contract`: 线程启动与消息发送流程需要承认 Claude mode selection 是运行时输入的一部分，不能再被产品层强制覆盖。

## 验收标准

- `Claude` provider 下，Mode Selector 不再被产品层强制锁死为 `bypassPermissions/full-access`。
- Phase 1 中，用户选择 `plan` 后，发送链路必须稳定映射到 Claude 的只读模式；选择 `full-access` 后必须稳定映射到跳过权限检查模式。
- 在审批桥未补齐前，`default` 与 `acceptEdits` 不得以“已可用”状态对普通用户暴露。
- Phase 2 中，Claude 进入需要审批的操作时，前端必须出现复用现有 approval 流程的审批请求，而不是静默失败。
- Phase 3 中，`acceptEdits` 必须满足“文件编辑可自动通过、命令仍可进入审批”的产品语义；若 Claude CLI 实际语义不同，必须在文案与规则中显式校正。
- 任意阶段都不得破坏 Codex、Gemini、OpenCode 的现有 mode 行为。

## Impact

- Affected frontend:
  - `src/app-shell.tsx`
  - `src/features/composer/components/ChatInputBox/selectors/ModeSelect.tsx`
  - `src/features/composer/components/ChatInputBox/types.ts`
  - `src/i18n/locales/zh.part2.ts`
  - `src/i18n/locales/en.part2.ts`
- Affected backend/runtime:
  - `src-tauri/src/engine/claude.rs`
  - `src-tauri/src/engine/claude/event_conversion.rs`
  - `src-tauri/src/engine/events.rs`
  - `src-tauri/src/codex/mod.rs`
- Affected tests/contracts:
  - `src/services/tauri.test.ts`
  - Claude mode mapping / approval event tests
  - runtime contract verification for approval request propagation
