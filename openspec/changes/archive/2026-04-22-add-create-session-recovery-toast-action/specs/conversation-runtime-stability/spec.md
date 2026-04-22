## MODIFIED Requirements

### Requirement: Recoverable Create-Session Failures MUST Expose A Direct Recovery Action

当系统已经能够判断某次 create-session failure 属于 stopping-runtime / runtime-recovering 这类可恢复错误时，前端 MUST 提供显性的恢复动作，而不是只留下纯文本错误结论。

#### Scenario: recoverable create-session failure shows reconnect-and-retry action

- **WHEN** 用户创建会话时收到 `[SESSION_CREATE_RUNTIME_RECOVERING]` 或等价的 recoverable create-session failure
- **THEN** 前端 MUST 展示一个显性的恢复入口
- **AND** 该入口 MUST 明确表达“重连并重试创建”而不是普通 dismiss

#### Scenario: recovery action reuses runtime-ready contract

- **WHEN** 用户点击 recoverable create-session failure 上的恢复动作
- **THEN** 系统 MUST 先执行 `ensureRuntimeReady` 或等价 runtime reconnect contract
- **AND** 随后 MUST 重试同一次 create-session intent

#### Scenario: recovery action reports pending and inline failure

- **WHEN** recoverable create-session toast 正在执行恢复动作
- **THEN** UI MUST 给出进行中状态，避免按钮无反馈
- **AND** 如果恢复动作失败，toast MUST 能在原位置展示失败 detail，而不是静默消失

#### Scenario: recovery action confirms runtime recovery before retry completes

- **WHEN** recoverable create-session toast 的恢复动作已经成功完成 runtime reconnect
- **THEN** UI MUST 给出一个短暂、显性的恢复中提示
- **AND** 该提示 MUST 明确表达 runtime 已恢复且系统正在重新创建会话
