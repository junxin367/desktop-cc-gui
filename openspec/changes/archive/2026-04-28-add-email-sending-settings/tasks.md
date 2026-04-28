## 1. Contract And Dependency Audit

- [x] 1.1 [P0][depends: none][input: `proposal.md`, `design.md`, `specs/email-sending-settings/spec.md`][output: confirmed implementation scope and non-goals][verify: code review notes] Confirm this change only builds email settings + SMTP send/test ability and does not implement automatic session reminders.
- [x] 1.2 [P0][depends: none][input: `src-tauri/Cargo.toml`, current Rust toolchain, release targets][output: dependency decision for SMTP and credential store][verify: `cargo info` notes in PR] Confirm `lettre` feature set and credential store choice before editing dependencies.
- [x] 1.3 [P0][depends: 1.1][input: `.trellis/spec/backend/*`, `.trellis/spec/frontend/*`, cross-layer guide][output: affected file list and validation plan][verify: implementation notes] Read required backend/frontend/cross-layer specs before code changes.

## 2. Settings Model And Secret Storage

- [x] 2.1 [P0][depends: 1.1][input: `src-tauri/src/types.rs`, `src/types.ts`][output: backward-compatible email settings structs/types with defaults][verify: Rust default/migration unit tests and `npm run typecheck`] Add non-sensitive email settings fields without breaking legacy settings deserialization.
- [x] 2.2 [P0][depends: 1.2][input: credential store dependency or adapter][output: email secret store module with get/set/clear/status operations][verify: unit tests for configured, missing, replace, clear, unavailable] Store authorization code/app password outside normal settings JSON.
- [x] 2.3 [P0][depends: 2.1,2.2][input: `src-tauri/src/shared/settings_core.rs`, `storage.rs` pattern][output: email settings update helpers using existing lock + atomic write semantics][verify: unit tests prove generic app settings save does not clear email secret] Keep non-secret settings and secret state synchronized without leaking secret.

## 3. Backend Email Sender

- [x] 3.1 [P0][depends: 1.2][input: `src-tauri/Cargo.toml`][output: SMTP dependency added with explicit TLS/features][verify: `cargo test --manifest-path src-tauri/Cargo.toml email`] Add SMTP dependency in the narrowest feature set that satisfies async send.
- [x] 3.2 [P0][depends: 2.1][input: provider preset table][output: preset resolver and validation helpers for `126`, `163`, `qq`, `custom`][verify: Rust tests for every provider and invalid host/port/security cases] Centralize preset behavior to avoid frontend/backend drift.
- [x] 3.3 [P0][depends: 2.2,3.1,3.2][input: email settings snapshot + secret][output: async SMTP sender with bounded timeout and text email support][verify: mocked/unit tests plus opt-in manual SMTP test] Implement real send path without blocking UI.
- [x] 3.4 [P0][depends: 3.3][input: SMTP/library errors][output: stable email error taxonomy with secret redaction][verify: tests for auth, connect, TLS, invalid recipient, missing secret] Map low-level errors to UI-safe structured errors.
- [x] 3.5 [P0][depends: 2.3,3.3][input: `src-tauri/src/command_registry.rs`, settings commands][output: `get/update email settings` and `send test email` commands registered][verify: command tests or integration-style unit tests] Expose only typed settings/test commands; keep generic sender internal for future reminders.

## 4. Frontend Settings Integration

- [x] 4.1 [P0][depends: 3.5][input: `src/services/tauri.ts`][output: typed email settings/test-send bridge functions][verify: `npm run typecheck` and bridge tests if present] Ensure Settings UI never calls `invoke()` directly.
- [x] 4.2 [P0][depends: 4.1][input: `SettingsView.tsx` or a new settings section component][output: email sender configuration UI with provider presets, custom fields, secret status, save, clear, and test send][verify: `SettingsView.test.tsx` focused tests] Add the Settings surface with loading, disabled, success, and error states.
- [x] 4.3 [P1][depends: 4.2][input: i18n locale files and Vitest setup translations][output: Chinese/English copy for email settings, provider help, auth-code hint, and errors][verify: no missing translation keys in tests] Keep user-visible copy routed through i18n.
- [ ] 4.4 [P1][depends: 4.2][input: existing settings styles][output: layout that fits current Settings visual system without oversized nested cards][verify: UI smoke and `npm run check:large-files` if large file thresholds are touched] Preserve Settings readability and avoid CSS/file-size regressions.

## 5. Tests And Validation

- [x] 5.1 [P0][depends: 2-3][input: backend email modules][output: Rust tests for settings defaults, secret store adapter, preset resolver, sender error mapping][verify: `cargo test --manifest-path src-tauri/Cargo.toml email`] Cover backend contract without requiring external SMTP in CI.
- [x] 5.2 [P0][depends: 4][input: Settings UI and tauri bridge mocks][output: Vitest coverage for provider switching, custom edits, save, clear secret, test send success/error][verify: `npm run test -- --run src/features/settings/components/SettingsView.test.tsx`] Protect frontend behavior and secret masking.
- [ ] 5.3 [P0][depends: 5.1,5.2][input: full change][output: baseline quality gates pass][verify: `npm run lint`, `npm run typecheck`, targeted `npm run test`, targeted `cargo test`] Run project-standard gates for touched layers.
- [ ] 5.4 [P1][depends: 5.3][input: real 126/163/QQ or custom SMTP account via local secret][output: manual acceptance note proving one real test email sends][verify: screenshot/log note without secret] Validate “能真的发送出邮件” outside CI with secret redacted.
- [ ] 5.5 [P1][depends: 5.4][input: implementation learnings][output: updated `.trellis/spec` guidance if new reusable email sender/security contract is introduced][verify: spec review] Capture reusable backend/secret handling conventions after implementation.
