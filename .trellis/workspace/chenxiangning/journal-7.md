# Journal - chenxiangning (Part 7)

> Continuation from `journal-6.md` (archived at ~2000 lines)
> Started: 2026-04-27

---



## Session 204: 补充 v0.4.9 发布说明

**Date**: 2026-04-27
**Task**: 补充 v0.4.9 发布说明
**Branch**: `feature/v0.4.9`

### Summary

(Add summary)

### Main Changes

任务目标：按用户要求将 CHANGELOG.md 的 v0.4.9 发布说明补充完整，并使用中文 Conventional Commit 提交。

主要改动：
- 在 v0.4.9 中文 Improvements 中追加 Codex 运行时生命周期恢复与 vendor unified_exec 成功提示等待验证条目。
- 在 v0.4.9 中文 Fixes 中追加失效会话手动恢复分流、Codex runtime 生命周期恢复边界、vendor unified_exec 断言过早修复条目。
- 在 English Improvements / Fixes 中追加对应英文条目，保持双语发布说明语义对齐。

涉及模块：
- CHANGELOG.md

验证结果：
- 提交前检查 CHANGELOG.md 中 v0.4.9 只有一个版本标题。
- 使用 git diff 确认本次业务提交仅包含 CHANGELOG.md 文档变更。
- 纯文档变更，未运行 lint/typecheck/test。

后续事项：
- 发版前如继续合入 v0.4.9 变更，建议再次按最终提交列表做 changelog diff 审查。


### Git Commits

| Hash | Message |
|------|---------|
| `82a4b7a6c0661de6f2acac7cd8c28fb78bb87a73` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 205: 修复 Windows Codex wrapper 会话启动降级

**Date**: 2026-04-28
**Task**: 修复 Windows Codex wrapper 会话启动降级
**Branch**: `feature/v0.4.11`

### Summary

(Add summary)

### Main Changes

任务目标：修复少数 Windows 11 用户通过 npm .cmd/.bat wrapper 创建 Codex 会话时 app-server 初始化前退出的问题，并用 OpenSpec 记录行为契约。

主要改动：
- 新增 OpenSpec change `fix-windows-codex-app-server-wrapper-launch`，包含 proposal、design、delta spec 和 tasks。
- 将 Codex app-server 参数拼装收口为共享 launch options，primary 路径保持内部 spec priority hint 注入。
- Windows .cmd/.bat wrapper primary 启动失败时，自动执行一次兼容 retry；retry 保留用户 codexArgs，但跳过内部 `developer_instructions` quoted config，避免穿过 `cmd.exe /c` 的 quoting 风险。
- probe/doctor 复用同一套 app-server 参数语义，保留 fallbackRetried / wrapperKind / appServerProbeStatus 诊断。
- 增加 DeferredStartupEventSink，避免 primary 失败但 fallback 成功时把早期 runtime/ended/stderr 泄漏到前端造成假失败。

涉及模块：
- src-tauri/src/backend/app_server.rs
- src-tauri/src/backend/app_server_cli.rs
- openspec/changes/fix-windows-codex-app-server-wrapper-launch/**

验证结果：
- cargo test --manifest-path src-tauri/Cargo.toml app_server_cli 通过：10 passed。
- cargo test --manifest-path src-tauri/Cargo.toml app_server 通过：69 passed。
- npm run typecheck 通过。
- openspec validate fix-windows-codex-app-server-wrapper-launch --strict 通过。
- git diff --check 通过。

后续事项：
- 需要问题 Win11 机器手工验证创建 Codex 会话。
- 需要健康 Win11 wrapper 环境确认 primary path 不触发 fallback。
- 需要 macOS smoke 确认非 Windows 路径无回归。


### Git Commits

| Hash | Message |
|------|---------|
| `a3d3744b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 206: 回写 Windows Codex wrapper 启动规范

**Date**: 2026-04-28
**Task**: 回写 Windows Codex wrapper 启动规范
**Branch**: `feature/v0.4.11`

### Summary

(Add summary)

### Main Changes

## 任务目标

检查 `fix-windows-codex-app-server-wrapper-launch` 提案是否已正常回写到 OpenSpec 主规范，并将缺失的规范同步落库后提交。

## 主要改动

- 新增主规范 `openspec/specs/codex-app-server-wrapper-launch/spec.md`，沉淀 Windows `.cmd/.bat` wrapper、兼容 retry、doctor/probe 对齐与测试保护的行为契约。
- 更新 active change delta spec，补充兼容 retry 成功后必须屏蔽 primary pre-connect failure events 的场景，避免 fallback 已连接但用户侧仍看到 primary `runtime/ended` 或 stderr 误报。
- 保持 change artifacts 完整，便于后续归档或继续验证。

## 涉及模块

- OpenSpec behavior spec：`codex-app-server-wrapper-launch`
- Active change：`fix-windows-codex-app-server-wrapper-launch`

## 验证结果

- `openspec validate fix-windows-codex-app-server-wrapper-launch --strict` 通过。
- `git diff --cached --check` 通过。
- 提交边界仅包含 OpenSpec 回写相关两个文件，未纳入工作区中其它未完成改动。

## 后续事项

- 若后续确认实现与规范完全稳定，可按 OpenSpec 流程归档该 change。
- 工作区仍存在其它任务的未提交改动，需要在各自任务中单独处理。


### Git Commits

| Hash | Message |
|------|---------|
| `16555e05256b851cc6cd2341a63b27be2ccbdbc5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 207: Nix 前端依赖改用 importNpmLock

**Date**: 2026-04-28
**Task**: Nix 前端依赖改用 importNpmLock
**Branch**: `feature/v0.4.11`

### Summary

(Add summary)

### Main Changes

任务目标：
- 响应 PR #428 后续反馈，将 Linux/Nix frontend npm dependency closure 从手写 npmDepsHash 迁移到 importNpmLock，避免 package-lock.json 或 root package metadata 变化后反复出现 fixed-output hash mismatch。

主要改动：
- flake.nix：用 pkgs.importNpmLock { npmRoot = ./.; } 和 pkgs.importNpmLock.npmConfigHook 替代 npmDepsHash / npmDepsFetcherVersion。
- OpenSpec fix-linux-nix-flake-packaging：更新 proposal、design、delta spec、tasks，记录 PR #428 follow-up commit fe252675 的自动 hash 方案。
- 明确只吸收 importNpmLock 自动化能力，不照抄 doCheck = false 或 chmod -R u+w dist。

涉及模块：
- Nix packaging：flake.nix
- OpenSpec：openspec/changes/fix-linux-nix-flake-packaging

验证结果：
- git diff --check 通过。
- openspec validate fix-linux-nix-flake-packaging --type change --strict --no-interactive 通过。
- package.json direct dependencies 均有 package-lock entry。
- registry resolved entries 均有 integrity。
- 当前 pinned nixpkgs 中确认存在 importNpmLock.npmConfigHook。

后续事项：
- 本机 nix 不可用，已按 shell 基线确认普通 shell、login shell 与 which nix 都找不到 nix。
- 仍需在 Nix-capable host 执行 nix build .# --no-link --print-build-logs、nix flake check --no-build、nix run .#。
- 若 Nix 实机构建后出现权限问题，再根据实际错误评估是否需要 PR #428 中的 chmod -R u+w dist；当前提交刻意不扩大范围。


### Git Commits

| Hash | Message |
|------|---------|
| `aa9d4d6b358d277c742ddd298f6ccdde5bf41ad9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 208: 模型选择器配置刷新入口

**Date**: 2026-04-28
**Task**: 模型选择器配置刷新入口
**Branch**: `feature/v0.4.11`

### Summary

(Add summary)

### Main Changes

任务目标：为 composer 模型选择器增加 provider-scoped 的底部双动作，左侧添加模型，右侧刷新配置，覆盖 Codex、Claude Code、Gemini。

主要改动：
- 新增 OpenSpec change add-model-selector-config-actions，沉淀模型选择器添加/刷新行为契约。
- ModelSelect 底部改为添加模型与刷新配置两个独立动作，补齐 loading、disabled、失败反馈与 i18n 文案。
- 贯通 ButtonArea、ChatInputBox、Composer、layout nodes 到 AppShell 的刷新回调和刷新状态。
- Codex 刷新复用供应商配置页的 reloadCodexRuntimeConfig，再刷新 Codex 模型列表。
- Claude Code 与 Gemini 通过 get_engine_models(forceRefresh) 刷新当前 provider catalog，并更新 engine status 快照。
- 补充 refreshCodexModelConfig、ModelSelect、ButtonArea、useEngineController、tauri invoke wrapper 的 focused tests。

涉及模块：
- openspec/changes/add-model-selector-config-actions
- src/features/composer/components/ChatInputBox
- src/features/models/refreshCodexModelConfig.ts
- src/features/engine/hooks/useEngineController.ts
- src/services/tauri.ts
- src-tauri/src/engine/commands.rs
- src-tauri/src/engine/manager.rs

验证结果：
- npx vitest run src/features/models/refreshCodexModelConfig.test.ts src/features/composer/components/ChatInputBox/selectors/ModelSelect.test.tsx src/features/composer/components/ChatInputBox/ButtonArea.test.tsx src/features/engine/hooks/useEngineController.test.tsx src/services/tauri.test.ts 通过，5 files / 106 tests。
- npm run typecheck 通过。
- npm run check:runtime-contracts 通过。
- npm run lint 通过。
- openspec validate add-model-selector-config-actions --type change --strict --no-interactive 通过。
- git diff --staged --check 通过。

后续事项：
- 全量 npm run test 此前曾在 batch 22/92 中途退出且无明确断言失败，本次提交以 focused tests 和关键门禁为准。
- 工作区仍保留快捷键/Nix packaging 等其它未提交改动，未纳入本次业务提交。


### Git Commits

| Hash | Message |
|------|---------|
| `8f802abb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
