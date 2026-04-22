## 1. OpenSpec And Task Context

- [x] 1.1 Verify `fix-history-expansion-scroll-restoration` artifacts are apply-ready and create/start the linked Trellis task. Input: `openspec/changes/fix-history-expansion-scroll-restoration/*`. Output: OpenSpec status shows proposal/specs/design/tasks present and the Trellis current task is bound to this change. Validation: `openspec status --change fix-history-expansion-scroll-restoration` and `python3 ./.trellis/scripts/task.py list`.

## 2. Core Implementation

- [x] 2.1 Capture a pre-expand scroll snapshot before enabling `showAllHistoryItems` in `src/features/messages/components/Messages.tsx`. Input: current `.messages` container ref, collapsed-history availability, user-triggered reveal action. Output: a one-shot pending snapshot that records the pre-expand scroll position and height only for history reveal. Validation: component logic review and targeted regression test setup confirm the snapshot is written only on history reveal.
- [x] 2.2 Apply history expansion scroll restoration after the expanded history window is rendered. Input: pending snapshot, post-render container `scrollHeight`, `showAllHistoryItems`, rendered history items. Output: container `scrollTop` is compensated by the inserted-history height delta using instant restoration. Validation: regression test shows the previously visible reading slice remains in place after clicking “show previous messages”.
- [x] 2.3 Re-sync dependent viewport state after restoration without changing existing scrolling contracts. Input: restored container position, existing anchor rail/history sticky update scheduling. Output: active anchor and sticky header calculations reflect the restored physical position, with no auto-follow or double-sticky regression. Validation: existing message behavior tests plus the new history reveal regression remain green.

## 3. Verification

- [x] 3.1 Add regression coverage for collapsed-history reveal viewport preservation. Input: `src/features/messages/components/Messages.live-behavior.test.tsx` and current scroll metric mocks. Output: a failing-before/passing-after test that reproduces the “jump to top after reveal” bug. Validation: `pnpm vitest run src/features/messages/components/Messages.live-behavior.test.tsx`.
- [x] 3.2 Run frontend quality gates for the changed message-view files. Input: messages component/test changes. Output: passing targeted tests, typecheck, and large-file guard or documented blocker. Validation: `npm run typecheck` and `npm run check:large-files`.
- [x] 3.3 Validate the OpenSpec change after implementation. Input: completed artifacts and implementation results. Output: strict OpenSpec validation passes for this change. Validation: `openspec validate fix-history-expansion-scroll-restoration --type change --strict --no-interactive`.
