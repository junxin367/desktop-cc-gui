import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { initialState, threadReducer } from "./useThreadsReducer";

describe("threadReducer completed duplicate collapse", () => {
  it("keeps one readable assistant message when final output repeats a large paragraph block", () => {
    const itemId = "assistant-large-complete-duplicate-1";
    const streamed = [
      "先按仓库规范做一次基线扫描。",
      "我会检查项目内的 `.claude/`、`.codex/`、`openspec/`，再看目录结构和技术栈。",
      "最后给你一个简明项目分析。",
    ].join("\n\n");
    const completed = [
      streamed,
      [
        "先按仓库规范做一次基线扫描。",
        "我会先检查项目内的 `.claude/`、`.codex/`、`openspec/`，再快速看目录结构和技术栈。",
        "最后给你一个简明的项目分析。",
      ].join("\n\n"),
    ].join("\n\n");

    const withDelta = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      delta: streamed,
      hasCustomName: false,
    });
    const merged = threadReducer(withDelta, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      text: completed,
      hasCustomName: false,
    });
    const finalized = threadReducer(merged, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: itemId,
        kind: "message",
        role: "assistant",
        text: completed,
      },
      hasCustomName: false,
    });

    const messages = (finalized.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant" && item.id === itemId,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe([
      "先按仓库规范做一次基线扫描。",
      "我会先检查项目内的 `.claude/`、`.codex/`、`openspec/`，再快速看目录结构和技术栈。",
      "最后给你一个简明的项目分析。",
    ].join("\n\n"));
  });
});
