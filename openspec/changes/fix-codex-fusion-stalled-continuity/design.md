## Context

当前 Codex queue fusion 存在一条典型的“乐观切换 > 接续未确认 > 状态长期悬空”链路：

- 前端在 `interruptTurn({ reason: "queue-fusion" })` 后会立即插入“已切换到融合回复，内容正在继续生成。”
- `same-run continuation` 或 `safe cutover` 真正是否接上，要等后续 `turn/started`、delta 或 execution item 才能证明
- runtime pool 仍可能因为 foreground continuity / active work protection 继续显示占用
- 如果后续没有新事件，又没有统一的 fusion stalled settlement，就会形成“线程像在继续、runtime 像在忙、实际上已经不动了”的假活跃状态

约束：

- 不能把 pin / warm retention 误用成 continuation 成功保证；它们本质上只处理 idle retention。
- 不能仅改文案，否则线程与 pool 的错位仍然存在。
- 不能让新的 stalled contract 影响非 Codex 引擎或正常长静默执行的合法路径。

## Goals / Non-Goals

**Goals:**

- 将 fusion continuation 从“乐观提示”改成“先进入待确认阶段，收到新证据后再升级为继续生成”。
- 为 Codex fusion continuation 增加 bounded settlement，避免无限 loading。
- 让 stalled fusion continuation 与 runtime pool continuity 共享同一组相关维度和清理时机。
- 让 fusion failed / stalled / runtime-ended 都能恢复 thread 可交互性并释放 fusion lock。

**Non-Goals:**

- 不重做 queue system 的 UI 结构或排序策略。
- 不修改 runtime budget / pin / warm TTL 的基本产品语义。
- 不为所有 engine 统一引入新的 continuation heartbeat 协议。
- 不把 provider 上游慢响应统一视作 stalled；只针对“fusion continuation 未推进”的 bounded window。

## Decisions

### Decision 1: 引入 fusion continuation 的显式“待确认”阶段

选择：

- 在 fusion 切换后先进入 `awaiting-resume-event` 或等价阶段。
- 只有收到新的 `turn/started`、delta 或 execution item 后，才把 UI 文案升级为“已继续生成”。

原因：

- 当前最误导人的点是“先确认继续生成，再等待证据”。
- 把确认时机后移，可以立即消除“假继续”。

备选方案：

- 继续沿用当前文案，只在超时后补错误。放弃，原因是用户前几秒已经被误导，诊断价值仍然很差。

### Decision 2: 复用 stalled recovery contract，不新造平行 fusion timeout 体系

选择：

- backend 使用现有 `turn/stalled` / foreground continuity 语义扩展 fusion continuation。
- 前端与 runtime pool 继续沿用 `resume-pending` / stalled / degraded 口径。

原因：

- 现有系统已经有 request-user-input resume watch、runtime continuity 与 stalled diagnostics。
- 单独为 fusion 再造一套 timeout event，会让 thread/runtime/pool 三边再次漂移。

备选方案：

- 仅在前端 hook 内部用 `setTimeout` 自己结算。放弃，原因是 pool 和 runtime 看不到这条 continuity，状态仍会不一致。

### Decision 3: fusion stalled 的清理必须覆盖 frontend lock 与 runtime continuity 两侧

选择：

- 一旦 stalled / error / runtime-ended / completed 发生，必须同时：
  - 清理 thread pseudo-processing
  - 清理 fusionByThread 残留状态
  - 清理 runtime foreground continuity

原因：

- 现在最常见的脏状态就是一侧清掉、一侧没清。
- 只清 thread 不清 runtime，会留下“池子仍 busy”；只清 runtime 不清 thread，会留下“界面仍在继续”。

备选方案：

- 只在 thread 层兜底清理。放弃，原因是 pool 仍会误导用户。

### Decision 4: same-run continuation 与 cutover 共享同一收口语义，但保留不同来源标签

选择：

- 两条路径都复用同一个 bounded resume watch。
- diagnostics 中额外记录 `source=same-run-fusion` 或 `source=cutover-fusion`。

原因：

- 用户面对的是同一种症状：切过去了，但没继续。
- 统一 settlement 逻辑更容易测，也更不容易漏清理。

备选方案：

- 每条 fusion 路径独立实现超时与清理。放弃，原因是逻辑重复且容易分叉。

## Risks / Trade-offs

- [Risk] bounded window 过短，会把合法静默 continuation 误判为 stalled。  
  → Mitigation：首版仅覆盖 fusion 切换后的接续确认窗口，不覆盖普通长静默生成；默认窗口使用较保守值并补 targeted tests。

- [Risk] late event 在 stalled 后才到达，可能出现“先报 stalled，后又恢复”的双态。  
  → Mitigation：保留 late event 兼容，但 terminal cleanup 与 resumed path 都要带 identity check，避免旧事件污染新状态。

- [Risk] 新增 source 标签后，frontend/runtime/pool 枚举值不同步。  
  → Mitigation：通过 delta specs 明确 source / stage 命名，并在实现中保持最小枚举集。

- [Risk] 改动面跨 frontend/backend/runtime，会放大回归范围。  
  → Mitigation：先围绕 Codex + queued fusion 写 targeted tests，不碰非相关 engine path。

## Migration Plan

1. 在 spec 层增加 fusion continuation stalled contract 与 runtime pool 对齐要求。
2. 在 frontend 将 fusion 切换文案改为待确认阶段，并补 fusion lock 收口逻辑。
3. 在 backend/runtime 抽象可复用的 fusion resume watch，并把 continuity 清理补到 terminal path。
4. 跑 targeted Vitest / Rust tests，确认 stalled / cleanup / late event 场景不回退。

回滚策略：

- 若 bounded settlement 误判明显，可先保留更保守的前端待确认文案，临时关闭 backend fusion stalled watch。
- 若 runtime continuity 清理有回归，可先保留 diagnostics，不改变 runtime pool 主状态文案。

## Open Questions

- fusion continuation 的 bounded window 是复用现有 `resume-after-user-input timeout`，还是单独加一个更短的 `fusion resume timeout` 更合适？
- stalled 后如果 late delta 仍到达，UI 是否需要显式显示“已恢复接续”，还是只静默恢复正常流即可？
- runtime pool 是否需要直接显示 continuation source（same-run / cutover），还是只暴露 stalled reason 已足够？
