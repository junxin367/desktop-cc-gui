## Context

当前消息幕布已经有两套 sticky 能力：

- realtime：`MessagesTimeline` 给最后一条 ordinary user question 的 wrapper 加 `.messages-live-sticky-user-message`，通过原生 `position: sticky` 固定原始气泡。
- history：`Messages.tsx` 基于滚动位置计算 `activeHistoryStickyCandidate`，在顶部渲染单独的 condensed sticky header。

这两套能力共享同一条 ordinary-user 过滤逻辑，但在 DOM 结构、样式 contract 和滚动语义上分叉。原气泡 sticky 的问题也比较明确：它会把完整富内容节点拖进顶部吸附层，长气泡和引用卡片更容易挡住阅读内容；同时 live window trimming 需要额外把那条用户消息重新塞回 render window，避免 sticky 锚点丢失。

这个变更的目标不是把 history 改回 realtime，而是让 realtime 复用已经在 history 成熟落地的 condensed sticky header 模型。

## Goals / Non-Goals

**Goals:**

- 统一 sticky 顶部视觉与 DOM：live/history 都使用 condensed sticky header。
- 让 realtime 复用 history 的 section handoff 语义：按物理滚动位置在当前 rendered ordinary user sections 之间接棒。
- 延续 ordinary-user 过滤逻辑与 copy/runtime/frontend-only contract。
- 让 live window trimming 下的当前问题仍然能参与 sticky header 计算。

**Non-Goals:**

- 不改变 history sticky 的接棒规则。
- 不新增第二套 overlay DOM 或副本气泡。
- 不修改消息窗口大小、折叠阈值或 runtime payload。
- 不改变用户消息正文、引用卡片、copy 文本的展示逻辑。

## Decisions

### Decision 1: 删除 realtime wrapper sticky，统一由单一 condensed sticky header 渲染层承接

顶部 sticky 的视觉输出只保留一套：`MessagesTimeline` 顶部的 condensed sticky header。realtime 不再通过 `.messages-live-sticky-user-message` 让原始 user bubble wrapper 参与 `position: sticky`。

这样 live/history 在 DOM 和视觉上就不会再分叉，后续滚动补偿、sticky handoff、样式维护都能收敛到同一个入口。

Alternatives considered:

- 保留 realtime wrapper sticky，只让样式更像 condensed header：视觉能靠近，但 DOM/滚动语义仍然分叉，风险没收口。
- 让 history 回退到 wrapper sticky：与真实使用反馈冲突，也会把已知问题带回 history browsing。

### Decision 2: realtime 复用 history-style handoff，但继续保住当前 turn 的最新问题 source row

realtime sticky 的资格规则不再维持“只有最后一条问题能吸顶”这套独立分支，而是直接复用 history 的 candidate 发现与 handoff 规则：

- 当前 rendered window 中，所有 ordinary user question sections 都能参与 sticky 计算
- agent task notification、memory-only payload、空 user 文本仍然排除
- 用户回看更早 section 时，sticky header 按物理滚动位置接棒，不做提前切换

live 的差异只保留在 render-window 保底：即使最新 ordinary user question 会被窗口裁掉，它仍要作为 source row 被保回 rendered set，保证当前 turn 的锚点能参与同一套 handoff 计算。

### Decision 3: 保留 live window trimming 对最新 user row 的“强制渲染”能力，但只作为 rendered candidate set 的保底来源

当前 `buildRenderedItemsWindow(...)` 会在 realtime 窗口裁剪时，把被裁掉的最新 ordinary user row 插回 render window。这条逻辑不能直接删掉，否则当前 turn 的问题一旦被裁掉，系统就无法通过 DOM `offsetTop` 判断它何时抵达顶部边界，也无法让它重新进入 history-style handoff。

因此 MVP 继续保留“把最新 ordinary user row 插回 render window”的策略，但它的用途从“让原始 wrapper sticky”变成“确保当前 turn 仍属于同一套 rendered candidate set”。更早 section 是否参与 sticky，则继续取决于它们是否已在 rendered window 内。

Alternatives considered:

- 让 realtime header 直接对隐藏 row 生效：会失去“触达顶部后才 sticky”的物理边界语义，header 可能过早出现。

### Decision 4: sticky candidate 模型直接统一为一个 rendered-section candidate set

实现上不再区分 live/history 两套 sticky candidate 数据流，而是统一成：

- 从 `renderedItems` 中提取 ordinary user question sections
- 通过同一套 `offsetTop <= scrollTop` 规则计算当前 `activeStickyMessageId`
- 只保留一个 `activeStickyHeaderCandidate` 作为顶部 header 出口

这样 live/history 在数据流、DOM 和样式 contract 上同时收敛，也避免多个 sticky header 同时出现。

### Decision 5: history spec 保持基线不变，只修改 realtime spec 的 presentation contract

这次 change 的本质是“让 realtime 对齐 history”，不是重定义 history 能力。因此 OpenSpec delta 只修改 `conversation-live-user-bubble-pinning`：

- 从“原始 user bubble sticky”改为“condensed sticky header”
- 补充 live window trimming 下仍要保住 sticky 候选的约束

`conversation-history-user-bubble-pinning` 不改 requirement，只继续作为统一基线。

## Risks / Trade-offs

- [realtime sticky 提前出现] 如果 live candidate 没有绑定到真实 DOM row，而是直接显示 header，会丢失“到达顶部才吸附”的语义。Mitigation: 保留 live row render-window injection，并继续基于 `offsetTop <= scrollTop` 判定。
- [双重 sticky] 如果 live/history candidate 没有统一收口，可能同时出现两个 header。Mitigation: 统一 `activeStickyHeaderCandidate` 出口，并删除 realtime 独立 wrapper sticky 分支。
- [大文件继续膨胀] `Messages.tsx` 仍然较大。Mitigation: 只做 contract 收敛，不顺手重构无关逻辑。
- [测试期望大范围改动] 现有 live behavior 测试写死了 realtime 使用 wrapper sticky。Mitigation: 更新断言，统一为 header sticky，并补充一条“realtime 不再渲染原 wrapper sticky class”的回归。

## Migration Plan

1. 创建 OpenSpec change，修改 `conversation-live-user-bubble-pinning` delta spec。
2. 删除 realtime wrapper sticky class 的渲染与样式。
3. 在 `Messages.tsx` / `MessagesTimeline.tsx` 中统一 sticky header candidate 出口与 handoff 计算。
4. 保留 live window trimming 对最新 ordinary user row 的 render-window 注入，但改为 rendered candidate set 的保底来源。
5. 更新 `Messages.live-behavior.test.tsx`，统一 live/history sticky 断言，并覆盖 realtime 回看更早 section 的 handoff。
6. 跑 targeted test、typecheck、large-file guard。

Rollback 仍然是纯前端回退：恢复 realtime wrapper sticky class 与旧测试即可，不涉及数据迁移。

## Open Questions

None for MVP. 当前目标是统一 sticky 表达，不顺手引入新的交互配置或布局抽象。
