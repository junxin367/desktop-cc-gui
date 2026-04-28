## Why

当前客户端只有声音与系统通知，无法把长任务完成、会话结束或重要消息推送到用户离开设备后仍可收到的外部通道。邮件是最低耦合、跨平台、无需额外企业 IM 依赖的通知基础设施，适合作为后续“消息 / 会话结束提醒”的 first backend。

本变更要先补齐“可配置、可验证、可真实发送”的 SMTP 邮件发送基础能力，而不是直接实现某个提醒策略。后续“对话完成后给指定邮箱发一封邮件”的场景应作为独立 conversation reminder change 消费本能力：对话层只保存收件人、触发条件与邮件内容策略，不接触 SMTP secret。

## 目标与边界

### 目标

- 在设置页新增邮件发送配置区域，支持 `126`、`163`、`QQ` 与 `custom` SMTP provider。
- 用户能够保存发件人邮箱、SMTP preset/custom host、端口、加密方式、用户名、默认收件箱与授权码 / app password。
- 系统必须提供测试发送能力，用户配置完成后能向已保存的默认收件箱真实发送测试邮件。
- 后端必须提供可复用的邮件发送 service，供后续会话结束、消息提醒等功能调用；AI skill / conversation reminder 只能通过受控 backend API 请求发送，不得保存或读取 SMTP secret。
- 邮件发送失败必须返回结构化、可诊断错误，不允许静默失败。
- 邮箱授权码等 secret 必须只保存在 credential store；设置页允许从专用 payload 明文回显，普通 AppSettings JSON、日志、错误与测试输出不得泄露明文。
- 旧用户升级后默认处于未配置 / disabled 状态，不影响现有声音通知、系统通知、会话和 runtime 流程。

### 边界

- 本提案只覆盖 SMTP 邮件配置与发送基础能力。
- 本提案允许为后续 conversation completion email reminder 预留内部 sender contract，但不落自动触发策略。
- provider preset 负责填充常见 SMTP 默认值，但用户仍可在 custom 模式下手动覆盖 host / port / security。
- 邮件正文第一版只要求纯文本或最小 HTML 模板，重点是可靠送达与可复用 API。
- 实现优先新增独立 backend module 与设置页 section；对既有 `AppSettings`、`src/services/tauri.ts`、command registry 只做必要接线。

## 非目标

- 不在本变更中实现“会话结束自动发邮件”或“消息规则引擎”；后续功能只消费本基础能力，并通过用户显式 opt-in 设置收件邮箱。
- 不实现收邮件、IMAP、邮件列表管理、联系人簿、批量群发或富文本编辑器。
- 不内置第三方邮件 API vendor（SendGrid、Mailgun、SES 等）；第一版只做标准 SMTP。
- 不自动探测用户邮箱服务商密码策略；界面只提示常见邮箱通常需要授权码 / app password。
- 不绕过 provider 安全策略，不支持保存明文密码到普通日志或错误信息。

## What Changes

- Settings 新增 “Email” / “邮件发送” 配置区：
  - provider：`126`、`163`、`qq`、`custom`。
  - enabled：是否启用邮件发送能力。
  - sender email / display name。
  - SMTP host / port / security mode（preset 自动填充，custom 可编辑）。
  - username、默认收件箱与授权码 / app password。
  - `发送测试邮件` 动作，默认使用已保存收件箱。
- Backend 新增 SMTP sender service：
  - 读取邮件配置并组装 message envelope。
  - 使用 SMTP TLS / STARTTLS 发送邮件。
  - 暴露 `send_test_email` 测试 command 与内部复用的 send API；不向 renderer 暴露任意群发接口。
  - 对认证失败、连接失败、TLS 失败、收件人非法、provider throttling 等错误做结构化归类。
- 后续 conversation completion reminder 的预期消费方式：
  - conversation 只记录 `enabled`、`recipient`、`includeSummary` 等低敏意图。
  - backend completion path 在用户 opt-in 后调用内部 EmailSender。
  - skill 可生成 subject/body，但不得接收、读取或存储 SMTP secret。
- Settings persistence 需要区分普通配置与 secret：
  - 非敏感字段进入 app settings。
  - 授权码 / app password 进入系统 credential store 或等价安全存储。
  - 返回给前端的邮件设置专用 payload 包含 `secretConfigured` 与 secret 明文，用于个人客户端设置页回显；普通 AppSettings JSON 不返回 secret 明文。
- i18n 与测试需要覆盖中英文文案、保存、测试发送、错误展示、secret masking 与旧设置默认值。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险 / 成本 | 结论 |
|---|---|---|---|---|
| A | 前端直接调用 mailto 或系统邮件客户端 | 实现最小，无 SMTP secret 存储 | 不能自动发送，无法作为后续提醒基础能力 | 不采用 |
| B | 后端 SMTP 基础能力 + Settings 配置 + 测试发送 | 能真实发送；调用方统一；不绑定提醒策略 | 需要新增 SMTP 依赖与 secret 存储 | 采用 |
| C | 直接接入第三方邮件 API vendor | 可观测性强，送达率高 | 需要账号、API key、vendor lock-in；不符合个人邮箱优先场景 | 不采用 |

依赖候选：

- `lettre 0.11.21`：SMTP email client，MIT license，支持 async Tokio 与 rustls/native-tls；已通过 `cargo info` 核对当前 crates.io 版本与 feature surface。建议实现时使用 `default-features = false` 并显式开启 `smtp-transport`、`builder`、`tokio1-rustls-tls`、`hostname`，保持 TLS 栈与现有 `reqwest rustls` 倾向一致。
- `keyring 3.6.3`：用于保存邮箱授权码。实现使用 `default-features = false` 并按平台开启窄 feature（macOS `apple-native`、Windows `windows-native`、Linux `linux-native-sync-persistent + crypto-rust`），避免 `keyring 4.0.0` sample/CLI 包引入过宽依赖面。

## Capabilities

### New Capabilities

- `email-sending-settings`: 定义设置页邮件发送配置、SMTP provider preset、secret handling、测试发送与后续调用方可复用的邮件发送 contract。

### Modified Capabilities

- 无。现有声音通知、系统通知与 conversation completion 行为保持不变；后续提醒功能应在独立 change 中消费 `email-sending-settings`。

## 验收标准

- 打开设置页时，用户 MUST 能看到邮件发送配置区域，并能选择 `126`、`163`、`QQ`、`custom` provider。
- 选择 `126`、`163`、`QQ` provider 后，系统 MUST 自动填充对应 SMTP host、推荐端口与安全模式；用户切换到 `custom` 后 MUST 能手动编辑 host / port / security。
- 用户未启用邮件发送或未保存有效配置时，后续调用方 MUST 能得到明确的 `not_configured` / `disabled` 状态，而不是尝试发送。
- 用户保存授权码 / app password 后，设置页 MUST 从 credential store 读取并回显 secret 明文，便于个人客户端用户检查配置。
- 用户保存合法收件箱并点击测试发送时，系统 MUST 真实发出测试邮件，成功后 UI MUST 展示成功反馈。
- SMTP 认证失败、网络连接失败、TLS 握手失败、收件人地址非法时，系统 MUST 返回可诊断错误类型与用户可读提示。
- 发送过程中的日志、错误、toast 与测试输出 MUST NOT 包含授权码 / app password 明文。
- 旧版 settings 缺少邮件字段时 MUST 正常反序列化，并默认 `enabled=false`、`provider=custom` 或等价未配置状态。
- 新增命令必须走 `src/services/tauri.ts` bridge 与 `src-tauri/src/command_registry.rs` 注册，不允许 feature component 直接 `invoke()`。
- 后续 AI skill 或 conversation reminder MUST 只发送受控 email intent，不得直接持有 SMTP host/username/secret 明文。

## Impact

- Frontend:
  - `src/types.ts` 增加邮件设置类型。
  - `src/services/tauri.ts` 增加邮件设置读取 / 保存 / 测试发送 bridge。
  - `src/features/settings/components/SettingsView.tsx` 或拆分后的 settings section 增加邮件配置 UI。
  - `src/i18n/locales/*` 增加邮件设置与错误文案。
- Backend:
  - `src-tauri/src/types.rs` 增加邮件 settings / request / response / error 类型。
  - 新增 `src-tauri/src/email/**` 或等价 module 承载 SMTP preset、secret store、sender service。
  - `src-tauri/src/command_registry.rs` 注册邮件配置与测试发送 commands。
  - `src-tauri/Cargo.toml` 增加 SMTP / credential store 依赖。
- Storage / Security:
  - 非敏感配置继续跟随 app settings lock + atomic write。
  - secret 使用系统 credential store 或明确安全替代方案，不进入普通 settings JSON。
- Tests:
  - Rust unit tests 覆盖 preset 解析、settings default/migration、secret masking、send error mapping。
  - Frontend Vitest 覆盖 settings UI provider 切换、custom 字段、保存、测试发送 loading/error/success。
  - 不要求 CI 真实连接外部 SMTP；真实发送作为手动验收或带环境变量的 opt-in integration test。
- Validation:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test -- --run src/features/settings/components/SettingsView.test.tsx`
  - `cargo test --manifest-path src-tauri/Cargo.toml email`
  - 手动验收：使用 126/163/QQ 任一授权码完成测试邮件发送。
