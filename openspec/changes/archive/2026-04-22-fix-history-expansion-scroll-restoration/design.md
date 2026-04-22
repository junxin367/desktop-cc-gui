## Context

`Messages.tsx` 当前通过 `showAllHistoryItems` 这个本地 state 控制历史折叠窗口是否一次性展开。现状是点击“显示之前的 N 条消息”时，只发生一次布尔切换，随后更早历史消息会被 prepend 到当前消息容器顶部；但组件没有记录展开前的滚动快照，也没有在 DOM 更新后补偿 `scrollTop`，所以用户阅读位置会被上推，形成明显跳屏。

消息幕布已经同时承担几类滚动相关能力：live auto-follow、anchor rail、history sticky header、live sticky header。这个修复不能粗暴改写统一 scroll 策略，否则容易把“展开历史”问题演成对整条消息滚动语义的重构。最合适的边界是把它做成一次局部、可回滚的 viewport restoration：只在用户主动展开 collapsed history 时记录快照，并在对应渲染完成后做一次 instant 补偿。

本变更仍然是 frontend-only，不影响 runtime command、storage schema、history loader 或跨层 payload contract。

## Goals / Non-Goals

**Goals:**

- 在历史展开前记录消息容器的滚动快照，并在展开后恢复当前阅读位置。
- 将恢复逻辑限制在 “show previous messages” 触发链路，不污染普通滚动、auto-follow 或手动 anchor 跳转。
- 让 history sticky / live sticky / anchor rail 在恢复后继续基于正确的物理滚动位置计算。
- 为该行为补一条稳定的 regression test，防止后续消息视图重构时回退。

**Non-Goals:**

- 不修改 `VISIBLE_MESSAGE_WINDOW`、折叠策略或历史展开的 UI copy。
- 不改写消息幕布的整体虚拟窗口算法。
- 不为异步高度变化资源（如未来可能出现的延迟加载图片）引入通用锚点恢复框架。
- 不触碰 Tauri、Rust backend、storage 或 runtime event 层。

## Decisions

### Decision 1: 使用容器高度差补偿，而不是首可见元素锚点恢复

展开前记录 `.messages` 容器的 `scrollTop` 与 `scrollHeight`。展开状态切换后，在布局已经反映新增历史项时，再计算新的 `scrollHeight`，把高度差加回 `scrollTop`，从而维持用户看到的内容区域基本不变。

这是最贴合当前实现的方案，因为历史展开本质上就是“在容器顶部插入一段原本没渲染的历史列表”。容器高度差直接反映了 prepend 内容带来的位移，不需要引入额外 DOM 查询和锚点映射。

Alternatives considered:

- 基于首个可见消息节点的 `getBoundingClientRect()` 做锚点恢复：理论上更鲁棒，但需要管理“哪个节点算阅读锚点”，还要处理 sticky header 与 collapsed placeholder 的相对关系，复杂度偏高。
- 直接滚到某条消息 id：不准确，因为点击时用户可能并不在消息块边界上，而是在中间阅读 assistant / reasoning 内容。

### Decision 2: 用一次性 pending snapshot ref 驱动恢复，而不是把恢复状态做成长期 React state

设计上应新增一个短生命周期的 pending snapshot ref，例如记录：

- 展开前的 `scrollTop`
- 展开前的 `scrollHeight`
- 可选的 `activeHistoryStickyMessageId` / active anchor 调试信息

点击历史展开控制时，仅在容器存在且当前确实有 collapsed history 时写入这份 ref，然后再切换 `showAllHistoryItems`。恢复完成后立即清空，避免后续普通 render 或 streaming 更新误触发 scroll compensation。

Alternatives considered:

- 用 React state 保存待恢复信息：会额外引入一次 render，并增加 effect 依赖面，不适合这种一次性 UI bookkeeping。

### Decision 3: 在布局阶段做 instant restoration，并在恢复后同步刷新 anchor / sticky 计算

恢复必须发生在 DOM 已经反映“展开后的完整列表”之后，因此更适合放在 `useLayoutEffect` 或等价的布局时机里执行，而不是普通 `useEffect`。这样浏览器在下一帧绘制前就能拿到修正后的 `scrollTop`，用户看到的是稳定视图，而不是先跳再回。

恢复时应使用 instant `scrollTop` 赋值，而不是 smooth scroll；这是位置补偿，不是用户发起的导航动画。补偿完成后，需要显式触发当前已有的 anchor/history sticky 同步逻辑，确保 active anchor 与 sticky header 基于补偿后的物理位置重新计算。

Alternatives considered:

- 在普通 `useEffect` 里补偿：有闪烁风险，尤其在高刷屏或长列表里更容易被肉眼看到。
- 使用 smooth scroll：会制造额外动画，反而强化“视图被移动过”的感知。

### Decision 4: 先接受“同步布局内容”为 MVP，异步高度漂移作为已知风险记录

当前消息幕布主要由文本、推理块、工具卡片构成，展开历史后的高度变化大多在当次 render 即可稳定。MVP 先只保证这一类同步布局场景的滚动恢复。

如果后续引入延迟撑高的内容类型，导致展开后又二次改变高度，再评估是否升级为“锚点元素 + 二次校正”方案。当前没有必要为尚未发生的复杂情况提前建通用框架。

## Risks / Trade-offs

- [布局时机判断错误] → 恢复过早会拿到旧 `scrollHeight`，恢复过晚会产生肉眼可见闪动。Mitigation: 使用布局阶段执行，并让恢复 ref 成为单次消费。
- [与 live auto-follow 互相干扰] → 如果展开历史时错误触发了 auto-follow，可能把视图又拉到底部。Mitigation: 明确把恢复逻辑限定为用户主动展开历史时的局部路径，不走 `requestAutoScroll()`。
- [sticky/anchor 计算漂移] → 恢复后如果不重算 active anchor 和 history sticky，顶部吸附内容可能暂时不准。Mitigation: 恢复完成后触发既有同步调度。
- [异步高度变化遗漏] → 极端情况下仍可能出现轻微偏移。Mitigation: 在 design 与测试说明中明确当前 fix 的适用边界，先覆盖已知 bug 场景。

## Migration Plan

1. 在当前 change 下新增 `conversation-history-expansion-scroll-restoration` delta spec。
2. 在 `Messages.tsx` 为历史展开入口添加 pre-expand scroll snapshot 记录。
3. 在布局阶段添加一次性 history expansion restoration，使用容器高度差补偿 `scrollTop`。
4. 恢复后同步已有 anchor/history sticky 计算。
5. 在 `Messages.live-behavior.test.tsx` 增加“展开历史不跳屏”的回归测试，并跑 frontend quality gates。

Rollback 仍然是纯前端回退：删除 pending snapshot/ref、恢复 effect 和对应测试即可，不涉及数据迁移或兼容层。

## Open Questions

None for MVP. 当前方案已经把范围限定在单次 collapsed-history reveal，对 issue #389 的现象是最直接、最低风险的修复路径。
