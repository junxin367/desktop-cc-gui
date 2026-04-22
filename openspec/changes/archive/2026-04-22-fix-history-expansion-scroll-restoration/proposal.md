## Why

消息幕布当前只渲染最近一段历史；当用户点击“显示之前的 N 条消息”时，旧消息会被一次性插入到当前视口上方。现有实现没有做 viewport compensation，结果是用户正在阅读的位置会突然跳走，视图回到更靠上的旧消息，长对话阅读被强行打断。

这个问题现在值得单独补齐，因为消息历史已经有 sticky header 等阅读辅助能力；如果展开历史时仍然发生跳屏，整条 history browsing 体验会显得不稳定，也会让后续滚动相关改动更难验证。

## 目标与边界

- 目标：当用户展开折叠的更早历史消息时，消息视口保持当前阅读位置稳定，不因为 prepend 旧消息而跳到更上方。
- 目标：滚动补偿只作用于消息幕布的前端展示层，不引入新的 runtime event、Tauri command、storage field 或 history loader payload。
- 边界：仅覆盖通过“显示之前的 N 条消息”触发的历史展开场景，不改变普通向下追随最新消息、手动滚动、realtime streaming 的既有语义。
- 边界：保持当前 `VISIBLE_MESSAGE_WINDOW` 和历史折叠策略不变，不重做消息虚拟列表或滚动容器架构。

## 非目标

- 不调整历史折叠阈值或一次展开的消息数量。
- 不改 history sticky header / live sticky header 的视觉样式或接棒规则。
- 不新增“回到原位置”按钮、手动 pin 控件或额外用户配置项。
- 不修改后端线程恢复、消息存储、跨源历史归并等 contract。

## What Changes

- 为历史展开控制新增 viewport preservation contract：当更早消息被插入到当前可见窗口上方时，消息视口 SHALL 补偿滚动位置，使展开前正在阅读的内容在展开后保持可见且位置基本稳定。
- 展开后的 scroll restoration SHALL 以“保住展开前的阅读锚点”为优先目标，而不是把用户带到新插入历史的顶部。
- 历史展开后的 viewport preservation SHALL 与现有 history sticky / live sticky 能力共存，不引入双重吸顶、提前切换或伪锚点问题。
- 该变更为纯前端行为修复，无 BREAKING API 或数据结构调整。

## 技术方案对比

| 方案 | 做法 | 优点 | 风险/取舍 |
| --- | --- | --- | --- |
| A. 基于容器高度差做滚动补偿 | 展开前记录消息容器的 `scrollTop` / `scrollHeight`，展开渲染后按新增高度差补回 `scrollTop` | 与当前“顶部 prepend 一批历史项”的数据形态最匹配，改动小，易回归测试 | 需要确保补偿时机在布局稳定后，避免与 sticky/header 计算互相打架 |
| B. 基于阅读锚点元素做位置恢复 | 展开前记录首个可见消息元素，展开后按该元素前后 `getBoundingClientRect()` 差值恢复 | 理论上对复杂高度变化更鲁棒 | 实现复杂度更高，和 sticky header、伪 user 行、折叠占位的交互面更大 |

选择方案 A。这个问题的核心是 prepend 一段固定历史窗口后没有补偿滚动，高度差补偿更直接，也更符合当前消息幕布结构。只有在后续发现异步高度变化导致补偿不稳定时，再考虑升级到锚点元素方案。

## Capabilities

### New Capabilities

- `conversation-history-expansion-scroll-restoration`: Defines viewport preservation behavior when previously collapsed conversation history is revealed above the current message window.

### Modified Capabilities

- None.

## 验收标准

- 当消息幕布存在“显示之前的 N 条消息”控制且用户点击展开时，展开前正在视口顶部附近的消息内容 MUST 在展开后保持基本相同的可视位置，系统 MUST NOT 跳到新插入历史的顶部。
- 历史展开后，用户继续阅读时，现有 history sticky header / live sticky header 行为 MUST 保持一致，不得因为补偿逻辑产生错误接棒或双重 sticky 状态。
- 当不存在折叠历史，或用户未触发展开控制时，消息滚动行为 MUST 与当前版本保持一致。
- 该变更 MUST 保持 frontend-only，不新增 Tauri command、runtime event、storage schema 或 history payload 字段。

## Impact

- Affected frontend components:
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
- Affected frontend helpers/tests:
  - `src/features/messages/components/messagesRenderUtils.ts`
  - `src/features/messages/components/Messages.live-behavior.test.tsx`
  - 可能新增一个专门的 history expansion scroll regression test
- No backend, IPC, storage, or dependency changes.
