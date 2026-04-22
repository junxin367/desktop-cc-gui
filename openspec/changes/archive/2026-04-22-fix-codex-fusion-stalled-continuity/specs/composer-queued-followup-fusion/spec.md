## MODIFIED Requirements

### Requirement: Queued Follow-up Fusion SHALL Prefer Existing In-Run Follow-up Semantics

系统 MUST 在 queue fusion 真正收到 continuation 证据前，将该动作视为“待确认接续”，而不是直接向用户宣称回复已经继续生成。

#### Scenario: same-run fusion remains pending until new continuation evidence arrives

- **GIVEN** 当前线程正在运行
- **AND** 当前引擎支持同轮 follow-up / steer
- **WHEN** 用户点击某条排队消息的 `融合`
- **THEN** 系统 MAY 先进入待确认接续状态
- **AND** 在收到新的 `turn/started`、stream delta、execution item 或等效 continuation 证据前 MUST NOT 直接宣称“内容正在继续生成”

#### Scenario: cutover fusion remains pending until successor run actually starts

- **GIVEN** 当前线程正在运行
- **AND** 当前引擎不支持同轮 follow-up / steer
- **AND** 当前引擎支持安全 cutover
- **WHEN** 用户点击某条排队消息的 `融合`
- **THEN** 系统 MUST 先等待 successor run 的真实启动证据
- **AND** 在 successor run 未被确认前 MUST NOT 把 cutover 视作已经成功继续

### Requirement: Queued Follow-up Fusion SHALL Preserve Queue Order Integrity

系统 MUST 在 fusion continuation 未接上的情况下有界结算当前融合动作，避免留下永久锁死的 fusion 状态。

#### Scenario: stalled continuation releases fusion lock and returns thread to recoverable state

- **WHEN** 用户对某一条队列项执行融合
- **AND** 在受限窗口内未收到新的 continuation 证据或终态事件
- **THEN** 系统 MUST 将该融合动作结算为 recoverable stalled / degraded
- **AND** 系统 MUST 清理该线程的 fusion lock
- **AND** 用户 MUST 能继续操作当前线程与后续排队消息

#### Scenario: terminal settlement clears unresolved fusion continuation

- **WHEN** 融合动作对应的恢复链最终收到了 completed、error、runtime-ended 或等效终态
- **THEN** 系统 MUST 清理该融合动作的待确认状态
- **AND** 剩余队列项 MUST 不再被已结束的 fusion continuation 阻塞
