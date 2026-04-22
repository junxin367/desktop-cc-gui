## Context

当前项目已经有多种“右下角或底部信息面”：

- `status panel`：thread/session 语义的底部 dock
- `error toast` / `update toast`：短时提醒语义
- `runtime console`：workspace-scoped 的运行日志与控制台语义

但这几类能力都不等价于“全局右下角持续提示框”：

- `status panel` 绑定当前 thread，上下文是会话，不是 app-global
- `toast` 更偏瞬时提醒，不适合做持续追加、可回看、可清空的信息流
- `runtime console` 是 workspace 级运行控制台，不适合承接 bootstrap / app init 级提示

这次变更属于典型 cross-cutting UI + state + event flow 变更：

- UI 侧需要在 `app-shell/layout` 挂一个全局组件
- state 侧需要区分 `UI state`、`feed state`、`persistent preference`
- producer 侧需要让 bootstrap、runtime adapter、error adapter 能向同一 feed push
- 同时还要避免和现有右下角能力产生语义冲突

约束：

- 必须保持“全局右下角提示框”方向，不退化成 tab、toast 堆叠或页面局部面板
- frontend persistent UI state 必须走 `clientStorage`
- user-visible copy 必须走 i18n
- phase 1 只做 session-scoped in-memory feed，不引入跨重启历史中心
- phase 1 不做未读数字角标，只保留最小化态高亮
- phase 1 仅关键错误允许双写进入 notice dock
- phase 1 的 notice queue 上限固定为 `120`

## Goals / Non-Goals

**Goals:**

- 提供一个 app-global 的右下角 notice dock，默认最小化为 `loading icon`
- 让 notice dock 支持 `minimized / expanded` 两种 UI 形态
- 定义统一的 notice item 模型，承接运行时提示与额外错误信息
- 提供可复用的 global push 机制，让 producer 不直接耦合具体组件
- 保持现有 `status panel`、`toast`、`runtime console` 的职责独立
- 通过 bounded buffer、clear 语义和 replay 机制，保证 notice feed 可持续使用

**Non-Goals:**

- 不做完整通知中心、历史检索、分类筛选、分页归档
- 不做跨窗口同步或跨重启 notice 历史持久化
- 不把原始 `stdout/stderr` 全量直接渲染进该组件
- 不要求现有所有 error toast 一次性迁移到 global notice dock

## Decisions

### Decision 1: 新增独立 `Global Runtime Notice Dock`，不复用 `status panel`

组件将作为 app-shell 级独立节点接入，和现有 `status panel` 并存，而不是在 `status panel` 中新增 tab。

原因：

- `status panel` 当前的 source-of-truth 是 active thread 的 `ConversationItem[]` 与 session 状态
- 这次需求要承接 app init、runtime bootstrap、全局错误等 app-global 事件
- 如果强行合并，thread 语义与 global 语义会互相污染，后续边界持续恶化

Alternatives considered:

- 方案 A：在 `status panel` 新增一个 `runtime notice` tab  
  缺点：产品语义错位，用户会把“当前线程状态”和“全局启动提示”混为一谈。
- 方案 B：在现有 `runtime console` 头部加一层摘要  
  缺点：runtime console 是 workspace-scoped，不覆盖纯 app init 阶段。

### Decision 2: 使用独立的 global notice hub，而不是组件 props 链式透传

notice producer 统一调用一个 service-level push API；app-shell 上的 dock 组件通过 hook 订阅这一 feed。

建议模型：

- `pushGlobalRuntimeNotice(input)`
- `subscribeGlobalRuntimeNotices(listener)`
- `useGlobalRuntimeNoticeDock()`

原因：

- 这与现有 `toasts.ts` / `events.ts` 的组织方式一致，接入成本低
- producer 无需知道组件在哪，降低耦合
- 后续如果要从 bootstrap、runtime event adapter、error adapter 同时接入，也不需要层层传 props

Alternatives considered:

- 方案 A：把 notice 列表 state 提升到 `app-shell.tsx`，再一层层向下传递  
  缺点：主壳层会继续膨胀，和现有 layout node 组织方向相反。
- 方案 B：直接复用 `error toast` listener 模型，不做 buffer/replay  
  缺点：启动初期消息可能发生在组件挂载前，容易丢首批初始化提示。

### Decision 3: feed state 使用 session-scoped in-memory queue，UI preference 单独持久化

notice 内容本身保存在内存中，仅在当前 app session 有效；是否最小化等 UI preference 走 `clientStorage`。

建议状态拆分：

- `UI state`
  - `visibility`: `minimized | expanded`
  - `highlight`: `idle | streaming | has-error`
- `Feed state`
  - `items: GlobalRuntimeNoticeItem[]`
  - `isUserPinnedAwayFromBottom: boolean`
- `Persistent state`
  - `app.globalRuntimeNoticeDock.visibility`

原因：

- 用户需求核心是持续提示，不是持久历史中心
- 用 `clientStorage` 只保留最小 UI 偏好，能满足“最小化习惯”而不引入历史迁移复杂度
- feed 留在内存更容易做 bounded queue、clear、replay 和测试
- phase 1 既然不做未读数字角标，就不引入单独的 unread counter 作为 UI contract，避免状态膨胀

Alternatives considered:

- 方案 A：把整个 notice feed 持久化到 `clientStorage`  
  缺点：会把短期运行时信息误提升成长期存储，且后续会引入清理/迁移负担。
- 方案 B：完全不持久化任何 UI state  
  缺点：用户每次重启都要重新调整最小化偏好，体验不稳定。

### Decision 4: 定义结构化 notice item，而不是直接渲染 raw log string

建议使用结构化模型：

```ts
type GlobalRuntimeNoticeItem = {
  id: string;
  message: string;
  severity: "info" | "warning" | "error";
  category: "bootstrap" | "runtime" | "workspace" | "diagnostic" | "user-action-error";
  createdAtMs: number;
  source: string;
  repeatCount?: number;
};
```

原因：

- 便于区分运行时提示与错误信息
- 便于后续做去重、合并、badge、样式和测试断言
- 防止 UI 直接绑定底层 raw payload，造成未来字段漂移

Alternatives considered:

- 方案 A：直接把 `runtime-log:line-appended` 的字符串行塞进 dock  
  缺点：信息噪音过高，也无法承接 bootstrap 和非 runtime 的全局提示。
- 方案 B：只支持纯文本 message，无 severity/category  
  缺点：会让 error 和普通提示在 UI 上失去稳定区分能力。

### Decision 5: 用 bounded queue(120) + replay-on-subscribe 解决“启动早期消息丢失”问题

global notice hub 内部维护一个上限为 `120` 条的 queue；新订阅者建立订阅时先收到当前快照，再接收后续增量 push。

原因：

- bootstrap 期提示可能发生在 dock 组件挂载前
- replay 可以保证用户首次展开时看到已有初始化信息，而不是空白
- bounded queue 可以防止长时间运行导致内存无界增长
- `120` 条对 phase 1 足够覆盖一次完整启动与短期运行过程，同时不会把组件推向“历史中心”

Alternatives considered:

- 方案 A：只发增量事件，不保留快照  
  缺点：组件晚挂载就会错过初始化阶段最重要的提示。
- 方案 B：无上限缓存  
  缺点：长时间运行会积累过量 notice，和这个组件的轻量定位冲突。

### Decision 6: `clear` 只清当前 feed，不影响 producer 生命周期

`clear` 语义定义为“清空当前已缓存 notice 项”，不关闭 hub，不取消订阅，不阻止未来 push。

原因：

- 用户说的是“提示框内容可以清空”，不是“关闭提示系统”
- 如果 clear 顺带停掉 feed，行为会和用户心智不匹配

Alternatives considered:

- 方案 A：clear 等于 stop listening  
  缺点：后续新错误不会进来，等于把组件打残。
- 方案 B：clear 只隐藏 UI，不清缓存  
  缺点：用户再次展开时仍看到旧内容，不符合“内容可以清空”。

### Decision 7: 第一阶段最小化态只保留高亮，不做未读数字角标

最小化状态只暴露两类反馈：

- `streaming`：有新的普通 runtime notice 到达
- `has-error`：有新的关键错误 notice 到达

第一阶段不展示未读数字，也不维护“精确未读数”作为用户契约。

原因：

- 这个组件 phase 1 的定位是“持续感知当前系统状态”，不是“通知 inbox”
- 一旦引入数字角标，用户心智会自然转向“逐条清理未读”，这会把产品推向通知中心
- 不做未读数字能显著降低状态复杂度和视觉噪音

Alternatives considered:

- 方案 A：显示精确未读数字  
  缺点：会引入 unread lifecycle、clear 后重置、展开是否清零等额外状态问题。
- 方案 B：显示粗粒度 `99+` 角标  
  缺点：即便不精确，也会把产品语义推向消息中心，而非轻量状态 dock。

### Decision 8: 第一阶段仅关键错误允许双写进入 notice dock

notice dock 不是 error sink；只有满足“需要持续停留、对用户理解当前系统状态有帮助”的关键错误，才允许与 toast 双写。

建议关键错误准入基线：

- 启动初始化被阻断或降级的错误
- runtime 连接、恢复、切换失败等关键链路错误
- 需要用户后续处理、且 toast 一闪而过会造成理解断裂的错误

继续只保留 toast 的错误：

- 普通表单/按钮失败
- 可立即重试且语义局部的瞬时错误
- 高频重复、短时间内无持续诊断价值的错误

原因：

- 如果所有错误都双写，notice dock 会迅速退化成噪音容器
- “关键错误白名单”更符合 phase 1 的节制原则，也更容易测试与验收

Alternatives considered:

- 方案 A：所有 error toast 自动镜像到 notice dock  
  缺点：噪音过大，且会和局部错误处理语义重叠。
- 方案 B：notice dock 完全不接错误，只放运行时提示  
  缺点：会失去用户最需要的“关键错误持续可见”价值。

## Producer Admission Baseline

Phase 1 的 producer 准入规则固定如下：

- 接入：
  - bootstrap 关键初始化节点
  - runtime lifecycle 关键节点
  - 关键错误白名单
- 不接入：
  - raw `stdout/stderr`
  - heartbeat / polling / 高频 retry
  - 普通局部瞬时错误

这组规则用于约束实现范围，也用于后续 review 判断“某条消息该不该进 dock”。

## Phase 1 Producer Admission Matrix

| Producer Source | Example Event / Current Anchor | Severity | Admit To Dock | Reason |
|---|---|---:|---|---|
| Bootstrap lifecycle | `bootstrap/start` in `src/bootstrapApp.tsx` | info | Yes | 属于 app-global 初始化起点，符合“客户端正在做什么”的核心语义 |
| Bootstrap degraded path | `bootstrap/local-storage-migration-failed` | warning | Yes | 启动继续，但属于用户可能需要知道的降级信息 |
| Bootstrap fatal path | `bootstrap/failed` + fallback screen | error | Yes | 启动主链路失败，必须持续可见 |
| Runtime lifecycle | `startup-pending` / runtime ready / reconnect success | info | Yes | 属于 runtime 主链路状态，且天然是 app-global 辅助信息 |
| Runtime degraded lifecycle | `suspect-stale` / `cooldown` / `quarantined` / fallback-retried | warning | Yes | 需要让用户知道系统已进入恢复、降级或隔离状态 |
| Runtime recovery hard failure | reconnect failed / recovery exhausted / stopping-runtime race unrecovered | error | Yes | 属于关键链路失败，toast 一闪而过会造成理解断裂 |
| Create-session recoverable failure | `useWorkspaceActions.ts` 中 `failedToCreateSession` recovery toast | error | Yes | 尽管由用户动作触发，但它指向 runtime 主链路问题，且已有 sticky/retry 语义 |
| Local workspace utility failure | detached explorer open failed / open in target app failed | error | No, toast-only | 语义局部，只影响单个动作，不应污染全局状态 dock |
| Settings / preferences failure | system proxy save failed / vendor settings save failed | error | No, toast-only | 属于页面局部设置失败，用户已在上下文内 |
| File / editor side effects | file external sync / file editor save / file opener failure | error | No, toast-only | 作用域局部，且已有更贴近上下文的反馈面 |
| Launch script and tool-side failure | launch script write failure / queued message fuse failure | error | No, toast-only | 这类错误更接近局部操作或特定工具能力，不适合进全局 dock |
| Placeholder / low-value feedback | `comingSoon` / model-switch hint / lightweight warnings | info/warning | No | 不具备持续停留价值，会把 dock 稀释成噪音容器 |

说明：

- `Admit To Dock = Yes` 的 producer，仍需先映射为结构化 notice item，不允许直接推 raw payload。
- `No, toast-only` 不是永久封死，而是 phase 1 的明确排除边界；除非后续 proposal 重新扩 scope，否则不进入 dock。

## Key Error Whitelist (Phase 1)

只有以下错误类型允许在第一阶段与 toast 双写进入 notice dock：

| Whitelist Key | Current Evidence / Anchor | Why It Qualifies |
|---|---|---|
| `bootstrap-fatal` | `src/bootstrapApp.tsx` 的 `bootstrap/failed` 与 fallback screen | 直接阻断客户端启动，是最高优先级全局错误 |
| `bootstrap-degraded` | `bootstrap/local-storage-migration-failed` 等“启动继续但已降级”错误 | 用户需要理解为何后续状态可能异常，但 toast 单次提示不够 |
| `runtime-startup-failed` | runtime startup failure / startup-pending timeout / probe failure | 属于 runtime 主链路故障，会影响后续会话使用 |
| `runtime-reconnect-failed` | reconnect failed / repeated recovery failure / cooldown / quarantined | 用户必须知道系统已处于恢复失败或受限状态 |
| `create-session-runtime-recovery-failed` | `useWorkspaceActions.ts` 中 `failedToCreateSession` + reconnect/retry 语义 | 表面是创建会话失败，本质是 runtime 关键链路错误，且已有 sticky 行为 |
| `runtime-degraded-requires-attention` | suspect-stale / fallback-retried / stopping predecessor diagnostics surfaced to user | 虽不一定立刻致命，但已构成用户需要关注的全局运行时降级 |

明确排除：

- `open-target-failed`
- `settings-save-failed`
- `file-sync-failed`
- `launch-script-write-failed`
- `coming-soon`
- `queued-message-tooling-failed`

这些错误继续走 toast 或局部 UI 反馈，不纳入 phase 1 global notice dock。

## Phase 1 Copy Baseline

Phase 1 的 notice copy 采用“短句摘要 + 当前状态”口径，不直接暴露 raw payload。实现时允许基于 i18n 做本地化，但语义模板必须保持一致。

### 1. Bootstrap

适用场景：

- app 启动开始
- 启动中的降级但继续运行
- 启动彻底失败

模板基线：

- `正在初始化本地状态...`
- `正在加载客户端配置...`
- `本地状态迁移失败，已按降级模式继续启动`
- `客户端初始化失败，请刷新后重试`

写法约束：

- 优先描述“系统正在做什么”
- 降级场景明确写“已继续”或“降级模式”
- fatal 场景明确写“初始化失败”

### 2. Runtime

适用场景：

- runtime 建连
- runtime ready
- runtime 切换或恢复开始

模板基线：

- `Codex runtime 正在连接...`
- `Codex runtime 已连接`
- `Runtime 正在恢复...`
- `Runtime 已重新就绪`

写法约束：

- 统一使用“正在 + 动作”或“已 + 状态”的完成体
- engine 名称可带可不带，但同一类入口要保持一致

### 3. Runtime Degraded / Recovery

适用场景：

- suspect-stale
- fallback-retried
- cooldown / quarantined
- 会话创建恢复链路

模板基线：

- `Runtime 探活异常，正在尝试恢复`
- `Runtime 已进入恢复模式`
- `Runtime 恢复失败，当前处于冷却期`
- `会话创建失败，正在尝试重连并重试`

写法约束：

- 先说当前状态，再说系统动作
- 如果系统还在自动处理，优先使用“正在尝试…”
- 如果自动处理已失败，明确写“恢复失败”或“处于冷却期”

### 4. Key Error

适用场景：

- 启动失败
- runtime 主链路失败
- 恢复失败，需要用户感知

模板基线：

- `启动失败：未能完成初始化`
- `运行时错误：当前连接不可用`
- `恢复失败：请稍后重试或手动重连`

写法约束：

- 前缀先标明错误类别：`启动失败` / `运行时错误` / `恢复失败`
- 冒号后只保留最短影响说明或动作导向
- 不把底层错误字符串原样拼进 UI copy；如需详细诊断，继续留给 debug surface / runtime console

## Expanded Panel Layout Baseline

展开态的目标不是“消息中心”，而是“轻量、持续、可扫读的右下角状态卡片”。因此 phase 1 的版式必须故意保持克制。

### 1. Panel Title

固定标题：

- `运行时提示`

原因：

- 比 `通知中心`、`系统消息` 更贴近当前产品语义
- 能明确区分它和 `status panel`、`toast`、`runtime console`

### 2. Header Layout

头部结构固定为：

`标题 + compact 状态标签 + 清空 + 最小化`

其中状态标签只允许以下聚合态：

- `空闲`
- `运行中`
- `异常`

设计约束：

- phase 1 不放 tabs
- phase 1 不放 filter
- phase 1 不放 category chip
- phase 1 不放 message count

原因：

- 一旦加 tabs/filter/count，用户心智就会滑向“通知 inbox”
- 当前组件的价值在于快速感知，不在于复杂管理

### 3. Notice Row Structure

每一行 notice 固定为三段：

- 左：severity 视觉提示
  - `info` 用中性/蓝色弱提示
  - `warning` 用黄色弱提示
  - `error` 用红色强提示
- 中：单行摘要文案
- 右：低权重时间戳

时间戳格式：

- `HH:mm:ss`

设计约束：

- 时间戳低对比度，不抢主文案
- 文案永远单行，不做自动换行
- 超长文本使用 ellipsis 截断
- phase 1 不提供行内展开/详情折叠

原因：

- 时间信息对“初始化过程”和“恢复链路”很重要，但不该比消息本身更抢眼
- 单行结构能让用户一眼扫完整个列表，而不会出现高低不齐的卡片墙

### 4. Empty State

空态建议固定为两行：

- 主文案：`暂无运行时提示`
- 辅助文案：`初始化进度和关键错误会显示在这里`

设计约束：

- 空态语气保持平静，不制造“异常感”
- 辅助文案只说明用途，不做教育式长说明

原因：

- 这个组件默认长期存在，空态必须稳定、耐看、低噪音

### 5. Visual Hierarchy Summary

展开态的视觉优先级固定如下：

1. 当前行摘要文案
2. `error` 类 severity 提示
3. 头部状态标签
4. 时间戳
5. 辅助说明或空态副文案

这条优先级用于约束后续样式设计，避免“时间戳比正文更显眼”或“状态标签抢过所有行内容”。

## Risks / Trade-offs

- [Risk] 与现有 `error toast` 同时展示，可能造成重复提醒。  
  Mitigation: phase 1 采用 key error whitelist，只有白名单内错误允许双写，其余保持 toast-only。

- [Risk] bootstrap 期 producer 接入过多，导致 notice feed 变成噪音墙。  
  Mitigation: phase 1 只允许 bootstrap 关键节点、runtime 关键节点和关键错误白名单进入 feed。

- [Risk] 右下角新组件与现有右下角/底部 surface 产生遮挡。  
  Mitigation: 设计阶段明确层级与停靠规则，优先保持 additive-only，不侵入现有入口。

- [Risk] 过度复用 runtime log payload，导致 UI 直接依赖底层日志格式。  
  Mitigation: 所有接入统一先经过 adapter，映射为结构化 notice item。

- [Risk] 不同 producer 各自生成 copy，最终口径不一致。  
  Mitigation: phase 1 固定 copy baseline，所有接入必须从四类模板演进，不允许自由拼接 raw message。

- [Risk] 展开态越做越像通知中心，最终破坏“轻量全局状态卡片”的定位。  
  Mitigation: 固定头部轻量结构、单列单行列表和无 tabs/filter/count 的 phase 1 layout baseline。

- [Risk] bounded queue 截断后用户以为消息“消失了”。  
  Mitigation: phase 1 先用较宽松的上限；若后续需要，再补“已折叠旧提示”弱提示文案。

## Migration Plan

1. 新增 `global-runtime-notice-dock` delta spec，锁定产品语义与边界。
2. 在 frontend service 层新增 global notice hub 与结构化 notice item 模型。
3. 在 app-shell/layout 挂载全局右下角 dock 组件与 hook。
4. 接入第一批 producer：
   - bootstrap / app init 提示
   - 需要持续停留的关键 error adapter
5. 将 `minimized/expanded` UI preference 接到 `clientStorage`。
6. 补充组件、hook、service 测试，并验证与现有 `status panel` / `toast` / `runtime console` 的兼容性。

Rollback strategy:

- 若新 dock 与既有右下角 surface 冲突，可先下线 app-shell 挂载点，保留 notice hub 代码不对外暴露
- 若 producer 接入噪音过大，可只保留 error adapter，回退 bootstrap 接入
- 本 change 不涉及数据迁移；最坏情况仅需删除 `clientStorage` 中新增 UI preference key

## Open Questions

- 右下角 dock 与当前布局中的其他 overlay 是否需要定义严格互斥/避让规则，还是先通过样式层级解决？
