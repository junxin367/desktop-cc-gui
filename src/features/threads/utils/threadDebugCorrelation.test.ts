import { describe, expect, it } from "vitest";
import { buildThreadDebugCorrelation } from "./threadDebugCorrelation";

describe("threadDebugCorrelation", () => {
  it("infers engine and recovery state from thread diagnostics", () => {
    expect(
      buildThreadDebugCorrelation(
        {
          workspaceId: "ws-1",
          threadId: "claude:session-1",
          action: "thread-history-error",
          diagnosticCategory: "runtime_quarantined",
        },
        { detail: "quarantine" },
      ),
    ).toEqual({
      workspaceId: "ws-1",
      threadId: "claude:session-1",
      engine: "claude",
      action: "thread-history-error",
      recoveryState: "quarantined",
      diagnosticCategory: "runtime_quarantined",
      detail: "quarantine",
    });
  });
});
