import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  buildChainedPromptPrefix,
  extractKanbanResultSnapshot,
} from "./resultSnapshot";

describe("kanban result snapshot utils", () => {
  it("extracts assistant summary and artifact paths", () => {
    const items: ConversationItem[] = [
      { id: "u1", kind: "message", role: "user", text: "do thing" },
      {
        id: "t1",
        kind: "tool",
        toolType: "exec",
        title: "run",
        detail: "ok",
        changes: [{ path: "/tmp/a.ts" }, { path: "/tmp/b.ts" }],
      },
      {
        id: "a1",
        kind: "message",
        role: "assistant",
        text: "Implemented and verified.",
      },
    ];
    const snapshot = extractKanbanResultSnapshot("thread-1", items, 1000);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.summary).toContain("Implemented");
    expect(snapshot?.artifactPaths).toEqual(["/tmp/a.ts", "/tmp/b.ts"]);
    expect(snapshot?.capturedAt).toBe(1000);
  });

  it("falls back to tool text when no assistant message exists", () => {
    const items: ConversationItem[] = [
      {
        id: "t1",
        kind: "tool",
        toolType: "exec",
        title: "run",
        detail: "command finished with output",
      },
    ];
    const snapshot = extractKanbanResultSnapshot("thread-2", items);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.summary).toContain("command finished");
  });

  it("builds chained prompt prefix with artifact list", () => {
    const prefix = buildChainedPromptPrefix({
      sourceThreadId: "thread-1",
      summary: "Done A",
      artifactPaths: ["/tmp/a.ts"],
      capturedAt: 123,
    });
    expect(prefix).toContain("Upstream result snapshot");
    expect(prefix).toContain("Done A");
    expect(prefix).toContain("/tmp/a.ts");
  });
});
