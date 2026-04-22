## Why

消息幕布当前对“用户问题吸顶”采用了两套不同实现：

- realtime processing：固定最后一条 ordinary user question 的原始气泡 wrapper
- history browsing：渲染 condensed sticky header 作为当前 section 的顶部锚点

这套分叉在实现上已经成立，但真实使用里会制造明显的心智割裂。用户不会区分“实时锚点”和“历史章节标题”这两个技术概念，只会感知成同一条能力在不同场景下行为不一致。

更关键的是，原始用户气泡直接 sticky 的方案已经暴露过问题：长问题、references 卡片、复杂富内容和窗口裁剪都会让顶部吸附层变重，容易遮挡阅读内容，也让滚动/布局修复更脆弱。history 模式现在使用的 condensed sticky header 更稳定，也更符合“边看边回溯”的真实阅读路径。需要把 realtime 统一到这套更稳的表达上。

## 目标与边界

- 目标：让 realtime processing 与 history browsing 使用同一种 condensed sticky header 视觉与 DOM 语义。
- 目标：realtime 期间也复用 history 的 section handoff 规则，允许用户回看更早问题时由对应 section 接棒 sticky header。
- 目标：history browsing 继续沿用现有 physical scroll position handoff 规则，不改变其接棒语义。
- 目标：统一 sticky header 仍然是 presentation-only，不修改 message payload、copy 内容、runtime event、history loader、storage schema。
- 边界：本变更只调整消息幕布前端渲染与滚动辅助逻辑，不重写消息窗口化架构，也不改 `VISIBLE_MESSAGE_WINDOW`。

## 非目标

- 不新增 pin/unpin 控件。
- 不让 assistant、reasoning、tool rows 参与顶部 sticky。
- 不改变 history sticky 的 physical handoff 规则。
- 不修改 Tauri command、backend、storage、history loader contract。
- 不重新设计消息富内容展示或用户气泡 copy 逻辑。

## What Changes

- realtime sticky 从“原始用户气泡 wrapper sticky”改为“复用 history condensed sticky header”。
- realtime 期间，sticky candidate 集合改为与 history 一样基于当前 rendered ordinary user question sections 计算；用户回看更早 section 时，sticky header 按物理滚动位置接棒。
- history browsing 保持现有 condensed sticky header 与 section handoff 行为不变，作为统一基线。
- 普通 user question 的判定逻辑继续共用同一套 ordinary-user 过滤契约，排除 agent task notification、memory-only payload、空 user 文本。
- realtime 窗口裁剪仍需保证最后一条当前问题 source row 可以参与 header 计算，不因为 live window trimming 而丢失当前 turn 的锚点。

## 技术方案对比

| 方案 | 做法 | 优点 | 风险/取舍 |
| --- | --- | --- | --- |
| A. realtime 改为复用 condensed sticky header | 移除 live wrapper sticky，统一走顶部 header 渲染；realtime 复用 history-style handoff，并保住最新问题 source row | 视觉一致、实现收敛、避免原气泡 sticky 已知问题 | 需要重新处理 realtime 候选在窗口裁剪下的可计算性 |
| B. history 回退到原气泡 sticky | 把 history sticky header 删除，统一使用 wrapper sticky | 表面上更“少代码” | 会把已知问题重新带回历史阅读，不符合实际使用反馈 |
| C. 保持两套实现，仅调样式靠拢 | realtime/history 继续不同 DOM，只让视觉更像 | 改动小 | 根因没解决，后续滚动行为和测试仍然双轨漂移 |

选择方案 A。history 的 condensed sticky header 已经验证更适合长对话阅读，应作为统一基线；realtime 也复用 history-style handoff，但仍保留“最后一条 ordinary user question 必须可参与 sticky 计算”的 live window 注入约束，不再保留原始气泡 sticky 形态。

## Capabilities

### Modified Capabilities

- `conversation-live-user-bubble-pinning`: Re-define realtime sticky presentation so rendered ordinary user sections use the same condensed sticky header and handoff model as history browsing, while keeping the latest current-turn question renderable under live trimming.

### Unchanged Capabilities

- `conversation-history-user-bubble-pinning`: Keep history section-header sticky behavior as the baseline implementation.

## 验收标准

- realtime processing 时，顶部 sticky 不再使用原始用户气泡 wrapper，而是使用与 history 一致的 condensed sticky header。
- realtime 期间，sticky header 对当前 rendered ordinary user sections 采用与 history 一致的 physical handoff；用户回看更早 section 时可以接棒。
- history browsing 的 condensed sticky header 与 section handoff 行为保持现状，不出现回退。
- restored history、collapsed history、memory-only user payload、agent task notification 等边界行为继续正确。
- live window trimming 仍然会保住最后一条当前问题 source row，使当前 turn 的 sticky header 在窗口裁剪下依然可计算。
- 该变更保持 frontend-only，不新增 runtime/storage/history contract 字段。

## Impact

- Affected frontend components:
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
- Affected frontend helpers/styles/tests:
  - `src/features/messages/components/messagesLiveWindow.ts`
  - `src/styles/messages.css`
  - `src/styles/messages.history-sticky.css`
  - `src/features/messages/components/Messages.live-behavior.test.tsx`
- Affected OpenSpec delta:
  - `conversation-live-user-bubble-pinning`
