## Why

当前客户端在启动初始化、runtime 连接、workspace 恢复、错误上报等链路里，已经会产生大量“过程型提示”，但这些信息分散在 console、toast、debug surface 和局部页面里，用户缺少一个稳定、全局、可回看的统一入口。  
这导致两个直接问题：一是启动期提示容易一闪而过，二是部分关键错误没有持续停留的可见载体，用户无法在不离开当前页面的前提下理解“客户端现在在做什么”与“哪里出了问题”。

## What Changes

- 新增一个 app-global 的右下角 `dock` 型提示组件，固定显示在客户端右下角，不归属于任何单独页面。
- 组件默认以 `loading icon` 作为最小化标识，点击后可展开为提示框查看内容。
- 展开态支持 `minimize`、`clear`，并以“一行一条提示”的形式持续展示运行时提示。
- 提示框支持混合展示运行时提示与额外错误信息，但展示语义保持统一，避免退化成普通 toast 堆叠。
- 定义全局 notice feed 的状态、分类、buffer、追加策略与 UI 边界，保证消息 push 机制可持续扩展。
- 第一阶段明确不做未读数字角标，只保留最小化态 `streaming / has-error` 高亮。
- 第一阶段错误接入采用 opt-in 策略，仅允许关键错误双写进 notice dock；普通瞬时错误继续只保留 toast。
- 第一阶段将 notice feed 的 session buffer 上限固定为 `120` 条。
- 第一阶段补充 producer admission matrix 与 key error whitelist，明确哪些真实入口允许进 dock，哪些保持 `toast-only`。
- 第一阶段补充 copy baseline，统一 `bootstrap / runtime / recovery / key error` 四类消息的文案口径，避免实现阶段各入口自行发挥。
- 第一阶段补充 expanded panel layout baseline，固定展开态标题、头部状态标签、列表行结构、时间戳与空态文案。

## 目标与边界

- 目标：提供一个全局右下角提示框，持续承接启动初始化与关键运行时提示。
- 目标：让用户在任意页面都能看到客户端正在进行的关键过程与错误，而不依赖某个 feature 页面。
- 目标：保持该组件轻量、稳定、默认不打断主流程，适合作为长期存在的全局辅助界面。
- 边界：第一阶段只做单窗口内的 app-global notice dock，不扩展为多窗口同步 notice center。
- 边界：第一阶段只要求列表型“一行一条提示”，不做复杂详情页、富文本诊断面板或筛选中心。
- 边界：第一阶段允许继续保留现有 error toast / status panel / runtime log，不替代这些已有能力。
- 边界：第一阶段最小化态只做高亮，不展示未读数字角标，也不因新消息自动展开。
- 边界：第一阶段只接入关键初始化节点与关键错误，不承接普通瞬时错误或高频噪音事件。
- 边界：第一阶段 notice 文案使用短句摘要模板，不展示底层 raw error payload 原文，不做长段诊断说明。
- 边界：第一阶段展开态不做 tabs、filters、category chip 或详情展开层，只保留标题、状态标签、清空/最小化和单列列表。

## 非目标

- 不把该组件改造成页面内面板、thread 级 panel 或右侧 workspace panel。
- 不把普通 `stdout/stderr` 原始 runtime log 直接无损搬运到该组件中。
- 不在本 change 中重做现有 `status panel`、`update toast`、`error toast` 或 `runtime console` 的主要交互语义。
- 不在第一阶段引入跨重启历史持久化、搜索、筛选、分组折叠或通知中心式消息管理。
- 不在第一阶段引入未读计数、消息筛选、错误分组中心或 message detail drill-down。

## Capabilities

### New Capabilities

- `global-runtime-notice-dock`: 定义全局右下角提示框的可见性、状态、消息展示、最小化与清空契约。

### Modified Capabilities

- _None_

## 方案对比

### 方案 A：复用现有 `status panel`，把提示塞进右下角现有 tab

- 优点：复用现有右下角 dock 形态，新增 UI 面较小。
- 缺点：`status panel` 当前是 thread/session 语义，而本需求是 app-global 语义；强行复用会把“全局初始化提示”和“当前线程状态”混在一起，信息边界会变脏。
- 结论：不选。产品语义不对，后续会持续放大耦合。

### 方案 B：继续沿用 `toast` 体系，做长驻或堆叠 toast

- 优点：接入简单，producer 改造成本低。
- 缺点：toast 天生偏瞬时提醒，不适合承载持续追加、可回看、可清空、可最小化的运行时信息流；一旦提示变多，很容易遮挡主界面并退化成噪音。
- 结论：不选。交互模型不匹配。

### 方案 C：新增独立的 `Global Runtime Notice Dock`

- 优点：产品语义清晰，天然满足“全局、持续、可最小化、可清空”的需求；同时能和现有 `status panel`、`toast`、`runtime log` 保持职责分离。
- 缺点：需要新增一条 global notice feed 与 app-shell 级组件接入点。
- 结论：采用。复杂度适中，但边界最清晰，长期演进空间最好。

## 验收标准

1. 客户端任意页面下，右下角 MUST 始终存在全局 notice 入口，不依附某个具体页面。
2. 默认态 MUST 以 `loading icon` 作为最小化标识，点击后 MUST 可展开提示框。
3. 展开态 MUST 支持最小化与清空内容；最小化不得阻止后续新提示继续 push。
4. notice 列表 MUST 以“一行一条提示”的形式展示运行时提示。
5. 初始化流程中的运行时提示 MUST 能持续 push 到该提示框中，而不是只显示一次后消失。
6. 额外错误信息 MUST 能 push 进同一提示框，并与普通运行时提示保持可区分语义。
7. 清空内容后，新的运行时提示到来时 MUST 能继续正常显示，不得因清空而失去后续订阅能力。
8. 第一阶段接入后，现有 `status panel`、`error toast`、`update toast`、`runtime console` 的既有主语义 MUST 保持兼容。
9. 第一阶段最小化态 MUST 仅通过 `streaming / has-error` 高亮反馈新状态，MUST NOT 展示未读数字角标。
10. 第一阶段仅关键错误允许双写进 notice dock；普通瞬时错误 MAY 继续只走 toast，不纳入本次强制迁移。
11. notice feed 的 session buffer MUST 以 `120` 条为上限，并在超过上限时保留最近内容。
12. 第一阶段展开态标题固定为 `运行时提示`，并展示一个 compact 状态标签，不提供 tabs 或筛选入口。
13. notice 列表行 MUST 采用“severity 视觉提示 + 单行摘要 + 低权重 `HH:mm:ss` 时间戳”的结构；超长文案 MUST 截断而不是换行。
14. 空态 MUST 展示稳定文案，例如 `暂无运行时提示`，并附带一句轻量辅助说明，提示初始化进度和关键错误会显示在这里。

## Impact

- Frontend shell/layout: `src/app-shell.tsx`、`src/features/layout/**`、可能新增 `src/features/notifications/**` 下的 global notice 组件与 hook
- Global state / persistent preference: `src/services/clientStorage.ts`
- Global event / message push layer: `src/services/events.ts`、现有 toast / runtime event adapter
- i18n / styles / tests: `src/i18n/locales/*`、`src/styles/*`、对应 Vitest 组件与 hook 测试
