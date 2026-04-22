## Why

OpenCode readiness currently gets probed from multiple automatic paths, including app bootstrap, Claude-only model refresh, and sidebar menu open. That background probing repeatedly spawns local `opencode` CLI work, which creates visible CPU churn and makes the client feel laggy even when the user did not ask to use OpenCode.

## 目标与边界

- 目标：把 OpenCode 的 sidebar readiness / provider probe 改成 explicit user action，避免默认后台反复检测。
- 边界：只收敛自动检测触发链路，不重写 OpenCode runtime、auth flow、session data model。

## 非目标

- 不修改 OpenCode provider 登录协议或 backend auth 命令格式。
- 不移除用户主动切换到 OpenCode 后所需的 user-initiated data load。
- 不调整 Claude/Codex/Gemini 的既有可用性策略。

## What Changes

- Remove automatic OpenCode provider-health probing when the workspace session menu opens or stays mounted.
- Stop using all-engine refresh as a side effect of Claude-only model refresh paths.
- Keep OpenCode readiness probing behind explicit refresh actions so detection only runs when the user asks for it.
- Make the workspace-menu refresh action the single explicit probe path: keep the menu open, apply refreshed engine availability in-place, and only then re-check OpenCode login state when the refreshed result shows OpenCode is installed.
- Preserve existing user-initiated OpenCode flows, including manual engine refresh and intentional OpenCode entry.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `opencode-mode-ux`: OpenCode provider health and sidebar session readiness must be refreshed explicitly instead of through background menu/bootstrap probes.

## Impact

- Frontend hooks: `src/features/app/hooks/useSidebarMenus.ts`, `src/features/engine/hooks/useEngineController.ts`
- App orchestration: `src/app-shell.tsx`
- Sidebar interaction surface: `src/features/app/components/Sidebar.tsx`
- Tests: `src/features/app/hooks/useSidebarMenus.test.tsx`, `src/features/engine/hooks/useEngineController.test.tsx`, `src/features/app/components/Sidebar.test.tsx`
- Runtime impact: fewer background `opencode` CLI launches and lower idle CPU churn

## 验收标准

- 打开工作区“新建会话”菜单时，OpenCode 不会自动进入“检测中...”并触发 provider probe。
- 新建 Claude pending thread 不会顺手触发 OpenCode engine detection。
- 用户点击 refresh 后，OpenCode 仍然可以按原路径执行手动检测。
- 用户点击工作区菜单内的 refresh 时，菜单 MUST 保持打开，并在当前弹层内直接回显最新 engine availability；对于 OpenCode，provider-health probe MUST 仅发生在这条手动 refresh 路径中。
