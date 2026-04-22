## 1. Capability framing and source-of-truth alignment

- [x] 1.1 明确 `global-runtime-notice-dock` 的模块边界与命名落位，输入为 proposal/design，输出为 feature/service 文件落点清单；优先级 `P0`；依赖：无；验证：不把实现塞进现有 `status-panel` 或 `runtime-log` 模块。
- [x] 1.2 盘点首期 producer 范围，只选择 bootstrap 关键提示与需要持续停留的关键错误，输入为现有 bootstrap / error adapter 流程，输出为 producer matrix；优先级 `P0`；依赖：1.1；验证：producer 列表可映射到 spec 中的 runtime prompt / error requirement。
- [x] 1.3 固化关键错误白名单与排除清单，输入为现有 error toast / runtime failure 场景，输出为“notice dock 双写准入表”；优先级 `P0`；依赖：1.2；验证：能明确区分哪些错误双写，哪些错误继续 toast-only。
- [x] 1.4 固化 phase 1 producer admission matrix，输入为 bootstrap / runtime / toast 调用点，输出为“允许进 dock / 保持 toast-only”的入口矩阵；优先级 `P0`；依赖：1.2、1.3；验证：每个候选入口都能找到归属，不再出现“凭感觉接入”的灰区。

## 2. Global notice hub and state model

- [x] 2.1 新增 global notice item 类型与 push/subscribe hub，输入为 design 中的结构化 notice 模型，输出为 service-level API（如 `pushGlobalRuntimeNotice` / `subscribeGlobalRuntimeNotices`）；优先级 `P0`；依赖：1.1；验证：service 单测覆盖追加顺序、severity 分类与 replay 快照。
- [x] 2.2 在 hub 内实现上限为 `120` 的 bounded session queue 与 clear 语义，输入为 spec 的 buffer / clear requirement，输出为有界 feed 管理逻辑；优先级 `P0`；依赖：2.1；验证：单测覆盖超过 `120` 条截断、clear 后继续 push、订阅不中断。
- [x] 2.3 将 dock 的 `minimized / expanded` UI preference 接入 `clientStorage`，输入为 design 的 persistent state 约定，输出为 domain-specific storage key 与 sanitize 读取逻辑；优先级 `P1`；依赖：2.1；验证：默认值、损坏值、读写回放场景通过。

## 3. Global dock UI integration

- [x] 3.1 新增全局右下角 notice dock 组件，输入为 spec 的 minimized / expanded / clear requirement，输出为独立组件与 props contract；优先级 `P0`；依赖：2.1；验证：组件测试覆盖最小化态、展开态、空态、清空态。
- [x] 3.2 在 app-shell/layout 挂载全局 dock 节点，并保持它独立于 `status panel`、`runtime console`、`error toast`；输入为 layout 现状与 design 边界，输出为最小挂载级改动；优先级 `P0`；依赖：3.1；验证：现有右下角/底部 surface 入口仍可达，布局无明显遮挡回归。
- [x] 3.3 实现最小化状态高亮策略（仅 `streaming` / `has-error`，不做未读数字角标），输入为 dock feed 状态，输出为最小化 icon 的视觉状态映射；优先级 `P1`；依赖：3.1；验证：组件测试覆盖普通提示、高亮错误、最小化后新消息到达且无数字角标。
- [x] 3.4 固化 expanded panel 的头部与空态版式，输入为 design 中的 layout baseline，输出为标题 `运行时提示`、状态标签、`清空/最小化` 与空态文案结构；优先级 `P1`；依赖：3.1；验证：组件测试覆盖 `空闲/运行中/异常` 三种头部状态和空态文案。
- [x] 3.5 固化 notice 行结构与时间戳展示，输入为 spec 的单行列表 requirement，输出为“severity cue + 单行摘要 + HH:mm:ss”的行视图 contract；优先级 `P1`；依赖：3.1；验证：长文案截断、时间戳低权重显示、不同 severity 视觉区分都可被测试断言。

## 4. Producer wiring and adapter mapping

- [x] 4.1 将 bootstrap / app initialization 的关键节点映射为结构化 notice item，输入为现有启动链路提示点，输出为首批 bootstrap producer；优先级 `P0`；依赖：2.1、1.2；验证：启动期能稳定看到多条一行一条 notice，而不是只保留最后一条。
- [x] 4.2 为关键错误路径增加 notice adapter，确保白名单内错误可以进入同一 feed，输入为现有 error toast / error handling 流程，输出为 error severity notice producer；优先级 `P0`；依赖：2.1、1.3；验证：关键错误双写成功，普通瞬时错误继续 toast-only，且不破坏现有 error toast。
- [x] 4.3 审核 producer 去重与噪音控制策略，避免同一错误或初始化步骤高频刷屏，输入为真实 producer 事件流，输出为最小重复折叠或节流规则；优先级 `P1`；依赖：4.1、4.2；验证：重复事件不会无限堆叠成噪音墙。

## 5. Copy, styling, and regression validation

- [x] 5.1 基于 phase 1 copy baseline 固化 `bootstrap / runtime / recovery / key error` 四类 i18n 文案模板，输入为 design 中的 copy baseline，输出为 locale key 与 message mapping；优先级 `P1`；依赖：1.4、4.2；验证：同类消息不再自由发挥，现有 producer 能映射到固定模板。
- [x] 5.2 新增样式与可访问名称，输入为 dock 交互文案、头部状态标签和时间戳展示需求，输出为 feature-scoped CSS 与 aria 文案；优先级 `P1`；依赖：3.4、3.5；验证：按钮/入口具备可访问名称，头部/行结构稳定，长文案不压坏布局。
- [x] 5.3 补充 service / hook / component 测试，覆盖 replay、buffer、clear、minimize、error severity、跨页面保持可见、copy template 映射稳定性，以及头部/时间戳/空态渲染契约；优先级 `P0`；依赖：2.2、3.2、4.2、5.1、5.2；验证：受影响 Vitest 用例通过。
- [x] 5.4 执行最小回归验证，确认新增 global notice dock 不改变 `status panel`、`runtime console`、`error toast`、`update toast` 的主语义；优先级 `P0`；依赖：5.3；验证：相关模块测试通过，且主壳层只保留最小接入改动。
