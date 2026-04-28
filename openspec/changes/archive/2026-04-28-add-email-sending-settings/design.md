## Context

mossx 现在已有通知声音与系统通知设置，适合“用户还在本机附近”的提醒场景；但长任务、会话结束、外部消息提醒需要一个离开设备后仍可触达的通道。典型场景是用户在某个 conversation 中显式设置“完成后发邮件给指定邮箱”。邮件发送能力应先作为基础设施落地：Settings 负责配置，Rust backend 负责 SMTP 和 secret，后续 conversation / reminder change 只消费一个稳定 sender contract。

当前设置链路是 `SettingsView -> src/services/tauri.ts -> Tauri command -> AppSettings/storage`。本变更需要跨 frontend settings、TypeScript bridge、Rust settings/types、command registry、credential store 与 SMTP dependency，属于跨层能力，不适合把逻辑塞在单个 Settings 组件里。

## Goals / Non-Goals

**Goals:**

- 用户能在 Settings 配置 126 / 163 / QQ / custom SMTP，并完成测试发送。
- 后端提供统一邮件发送 service，供后续会话结束提醒复用。
- 为后续 conversation completion email reminder 提供受控 sender contract：conversation / skill 只能提交 email intent，不接触 SMTP secret。
- 授权码 / app password 不进入普通 app settings JSON，不被日志、错误消息或测试输出泄露；设置页专用 view model 允许从 credential store 明文回显，服务个人客户端配置体验。
- 邮件发送错误具备结构化分类，便于 UI 展示和后续自动提醒降级。
- 新增能力默认 disabled，旧设置文件兼容读取。

**Non-Goals:**

- 不实现会话结束自动邮件提醒、消息规则、通知中心或邮件模板系统。
- 不在本 change 中保存 conversation-level recipient / trigger policy；这属于后续独立 reminder change。
- 不实现收邮件、IMAP、联系人、批量群发、附件或富文本编辑。
- 不支持第三方邮件 API vendor；第一版只支持标准 SMTP。
- 不让前端组件直接处理 SMTP，也不让 feature component 直接 `invoke()`。

## Decisions

### Decision 1: SMTP sender 放在 Rust backend，Settings UI 只走 bridge

邮件发送必须由 backend 执行。Frontend 只负责编辑配置、触发测试发送、展示结果，所有调用通过 `src/services/tauri.ts` 暴露的 typed function。

逻辑流：

1. Settings UI 调用 `getEmailSenderSettings()` 获取 view model。
2. 用户保存配置时调用 `updateEmailSenderSettings(input)`。
3. backend 持有 `AppSettings` lock，写入非敏感配置；如 input 带新 secret，则写入 credential store。
4. 用户点击测试发送时调用 `sendEmailTest({ recipient })`。
5. backend 读取设置快照与 credential store secret，构建 message，调用 SMTP sender，返回结构化结果。

替代方案：前端直接拼 SMTP 或调用 `mailto:`。这无法保证真实自动发送，也无法成为后续后台提醒基础能力，因此不采用。

### Decision 2: 非敏感配置进入 AppSettings，secret 进入系统 credential store

建议新增非敏感配置结构：

- `enabled`
- `provider`: `126 | 163 | qq | custom`
- `senderEmail`
- `senderName`
- `smtpHost`
- `smtpPort`
- `security`: `ssl_tls | start_tls | none`
- `username`
- `recipientEmail`: 默认收件箱，测试发送和后续默认邮件发送使用该地址

授权码 / app password 使用 `keyring 3.6.3` 或等价系统 credential store，返回给 Settings 邮件配置页的专用 view model 包含 `secretConfigured: boolean` 与 secret 明文，用于个人客户端回显与修改。credential account 建议使用稳定单账号，例如 service `mossx.email-sender` + account `default`，避免邮箱变更导致 secret 查找漂移；当用户清空 secret 或关闭配置时提供显式 clear action。普通 AppSettings JSON、日志、错误与测试输出仍不得包含 secret 明文。

替代方案：把授权码直接放入 `AppSettings` JSON。实现最短，但这会让密钥进入普通配置、备份、日志与调试输出风险面，不采用。

### Decision 3: Provider preset 只提供默认 SMTP 参数，不成为不可变规则

provider preset 表集中在 backend 或 shared constants 中：

| Provider | Host | Default port | Security |
|---|---|---:|---|
| `126` | `smtp.126.com` | `465` | `ssl_tls` |
| `163` | `smtp.163.com` | `465` | `ssl_tls` |
| `qq` | `smtp.qq.com` | `465` | `ssl_tls` |
| `custom` | user input | user input | user input |

UI 选择 preset 时填充默认值；用户切换 custom 后必须可以编辑全部 SMTP 字段。实现时不要把 preset 写死在多个文件里，避免 provider 默认值漂移。

替代方案：只让用户填写 host/port。技术上更简单，但用户每次都要查邮箱文档，且无法满足“支持 126/163/QQ 等主流邮箱”的产品目标，不采用。

### Decision 4: 发送 API 分成测试 command 与内部 sender contract

第一版不开放“任意邮件发送”给 UI surface，只提供测试发送 command；后续提醒从 backend 内部调用同一个 `EmailSender` service。

建议内部输入模型：

- `EmailSendRequest { to, subject, text_body, html_body?, context? }`
- `EmailSendResult { message_id?, provider, accepted_recipients, duration_ms }`
- `EmailSendError { code, retryable, user_message, detail? }`

测试发送 command 默认读取已保存的 `recipientEmail` 作为收件箱；内部 sender contract 仍可在后续能力中显式传入收件人，以支持更细的 reminder policy。这样可以先验证真实 SMTP 可用，又不会在 renderer 层暴露一个容易被误用的通用群发接口。

### Decision 4.1: AI skill / conversation reminder 只持有发送意图，不持有 SMTP 凭据

后续“对话完成后发邮件”应把 SMTP 配置视为客户端全局能力，把 conversation-level 设置视为低敏 intent：

- `enabled`
- `recipient`
- `includeSummary`
- `confirmBeforeSend`

conversation reminder 可以请求 backend 发送邮件，skill 可以生成 subject/body，但二者都不读取 `smtpHost`、`username` 或 secret 明文。这样能把外部副作用的权限边界收口在客户端 Settings 与 backend sender，避免 AI 上下文、skill 文件、日志或 transcript 泄露授权码。

### Decision 5: 使用 `lettre` 作为 SMTP 实现候选

`lettre 0.11.21` 是当前 crates.io 上的 Rust email client，支持 SMTP、message builder、Tokio async 与 rustls feature。建议实现时使用显式 feature：

- `default-features = false`
- `features = ["smtp-transport", "builder", "tokio1-rustls-tls", "hostname"]`

这样能避免默认 `native-tls` 被隐式拉入，并保持 TLS 依赖选择可审计。若目标平台证书验证出现兼容问题，再评估 `rustls-platform-verifier` 或 native TLS，不在第一版提前扩大。

## Error Model

邮件错误必须脱离原始库错误字符串，统一映射为稳定 code：

- `disabled`
- `not_configured`
- `missing_secret`
- `invalid_sender`
- `invalid_recipient`
- `connect_failed`
- `tls_failed`
- `authentication_failed`
- `send_rejected`
- `timeout`
- `secret_store_unavailable`
- `unknown`

`detail` 可以包含 host、port、provider、retryable 等诊断信息，但必须先做 secret redaction。UI 不应依据英文库错误做分支。

## Migration Plan

1. 为 Rust / TypeScript `AppSettings` 增加邮件非敏感字段，提供 default，旧 settings 反序列化为 disabled / unconfigured。
2. 新增 email module，先实现 preset、validation、secret store adapter 与 error mapping 的纯单元测试。
3. 接入 `lettre` sender 与测试发送 command。
4. 在 `src/services/tauri.ts` 增加 typed bridge，再接入 Settings section。
5. 增加 frontend / backend tests 与 opt-in 手动 SMTP 验收。

Rollback 策略：

- 如 SMTP 依赖或 credential store 在某个平台存在阻断，可保留 settings 字段但隐藏 UI / 禁用 command，并让 sender 返回 `secret_store_unavailable` 或 `not_configured`。
- 因默认 disabled，回滚 UI 与 command 不会影响现有会话、通知声音或系统通知。

## Risks / Trade-offs

- [Risk] 主流邮箱 SMTP 需要授权码而非登录密码，用户容易配置错。  
  Mitigation: UI 明确提示“使用授权码 / app password”，认证失败返回 `authentication_failed`。

- [Risk] credential store 在 Linux / Windows / macOS 行为不完全一致。  
  Mitigation: secret store adapter 单独封装；保存 secret 失败不污染 app settings；测试覆盖 unavailable 分支。

- [Risk] SMTP 外部网络测试在 CI 中不稳定。  
  Mitigation: CI 只做 unit / mocked sender；真实发送作为手动验收或环境变量 gated integration test。

- [Risk] 后续提醒功能可能把邮件发送变成噪音源。  
  Mitigation: 本 change 不做自动提醒；后续 change 必须定义触发条件、去重、节流与用户 opt-in。

- [Risk] 错误日志可能从底层库带出 credential。  
  Mitigation: 所有 error mapping 先经过 redaction helper；日志只记录 provider、host、port、error code。

## Open Questions

- 是否要在第一版支持 `587 + STARTTLS` 作为 preset 的备选端口，还是只在 custom 中让用户自行选择。
- credential store 当前采用 `keyring 3.6.3` + 平台窄 feature；release pipeline 仍需确认 Linux credential backend 可用性。
- 测试邮件的默认 subject/body 是否需要包含 app/version/workspace 信息；第一版建议保持最小，避免泄露项目上下文。
