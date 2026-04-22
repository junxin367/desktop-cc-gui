## 1. OpenSpec And Task Context

- [x] 1.1 Complete proposal/design/spec/tasks artifacts for `align-live-sticky-with-history-header` and bind the Trellis task to this change. Validation: `openspec status --change align-live-sticky-with-history-header` and `python3 ./.trellis/scripts/task.py list`.

## 2. Core Implementation

- [x] 2.1 Replace realtime wrapper-sticky rendering with the shared condensed sticky header path in `src/features/messages/components/Messages.tsx` and `MessagesTimeline.tsx`. Input: existing `latestLiveStickyUserMessageId`, `activeHistoryStickyCandidate`, render path split. Output: live/history share one sticky header outlet and one history-style handoff model over rendered ordinary user sections. Validation: component review plus targeted behavior tests.
- [x] 2.2 Preserve realtime scroll-back behavior while reusing history-style presentation. Input: ordinary-user filtering in `messagesLiveWindow.ts`, active `isThinking`, restored-history guard. Output: realtime no longer renders wrapper sticky DOM, and scrolling back to earlier rendered user sections reuses the same physical handoff semantics as history. Validation: targeted tests cover realtime handoff and restored-history fallback.
- [x] 2.3 Keep live window trimming compatible with the unified header model. Input: `buildRenderedItemsWindow(...)`, `VISIBLE_MESSAGE_WINDOW`, latest live candidate. Output: the latest live ordinary user row stays renderable as part of the sticky-header candidate set without phantom collapsed indicators. Validation: regression tests for trimmed live windows remain green.
- [x] 2.4 Remove obsolete realtime sticky CSS contract and keep history sticky styling as the shared baseline. Input: `src/styles/messages.css`, `src/styles/messages.history-sticky.css`. Output: `.messages-live-sticky-user-message` is no longer required, and condensed sticky header remains the only sticky visual contract. Validation: test assertions plus manual DOM review.

## 3. Verification

- [x] 3.1 Update `src/features/messages/components/Messages.live-behavior.test.tsx` to assert unified condensed sticky header behavior for realtime and history. Validation: `pnpm vitest run src/features/messages/components/Messages.live-behavior.test.tsx`.
- [x] 3.2 Run required frontend quality gates for the touched message files. Validation: `npm run typecheck` and `npm run check:large-files`.
- [x] 3.3 Validate the OpenSpec change after implementation. Validation: `openspec validate align-live-sticky-with-history-header --type change --strict --no-interactive`.
