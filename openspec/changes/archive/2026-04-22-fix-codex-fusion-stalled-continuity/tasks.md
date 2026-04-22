## 1. Fusion Continuation Contract

- [x] 1.1 为 queued fusion 增加“待确认接续”阶段，避免在 continuation 证据出现前直接宣称“内容正在继续生成”。[P0][依赖: 无][输入: `useThreadMessaging.ts`, `useQueuedSend.ts`][输出: fusion 切换文案从乐观确认改为待确认语义][验证: hook/component test 断言文案仅在 resumed evidence 后升级]
- [x] 1.2 为 same-run continuation 与 cutover 统一接入 bounded fusion settlement。[P0][依赖: 1.1][输入: `useQueuedSend.ts`, backend stalled watch 设计][输出: fusion 未接续时进入 recoverable stalled 而非永久 loading][验证: targeted tests 覆盖 no-turn-start / no-delta / no-item 场景]

## 2. Backend And Runtime Continuity

- [x] 2.1 在 app-server / runtime continuity 中为 fusion continuation 记录可关联 source、thread、turn 与 timeout stage。[P0][依赖: 1.2][输入: `app_server.rs`, `app_server_event_helpers.rs`, `runtime/mod.rs`][输出: fusion stalled 具备跨层 diagnostics][验证: Rust tests 或 event tests 断言 stalled payload 含 source/stage]
- [x] 2.2 补齐 completed / error / runtime-ended / recoverable abort 对 fusion continuity 的统一清理。[P0][依赖: 2.1][输入: runtime cleanup paths + thread turn settle paths][输出: 不再残留 busy pool / locked fusion / pseudo-processing][验证: targeted regression tests 覆盖 terminal cleanup]

## 3. Runtime Pool And Thread Alignment

- [x] 3.1 更新 runtime pool snapshot / UI，使 stalled fusion continuation 与 plain retained runtime 可区分。[P1][依赖: 2.1][输入: `runtime/mod.rs`, `RuntimePoolSection.tsx`][输出: pool 可显示 fusion stalled foreground continuity][验证: UI tests 或 snapshot tests 断言标签与 reason]
- [x] 3.2 让 thread-facing diagnostics、error message 与 runtime pool 共享一致的 stalled 语义。[P1][依赖: 2.2, 3.1][输入: `useThreadTurnEvents.ts`, `useAppServerEvents.ts`, i18n 文案][输出: 前后端对同一 stalled chain 口径一致][验证: event tests 断言 processing 退出 + diagnostics 一致]

## 4. Verification

- [x] 4.1 补齐 fusion success / stalled / late event / runtime-ended 回归测试。[P0][依赖: 1.2, 2.2, 3.2][输入: 现有 queued send / thread messaging / app server tests][输出: 最小闭环回归覆盖][验证: `vitest` 目标测试通过]
- [x] 4.2 运行受影响的 frontend / Rust 目标测试，确认 Codex path 修复且非 Codex path 不回退。[P1][依赖: 4.1][输入: 目标测试命令][输出: 验证结果][验证: 测试命令通过]
