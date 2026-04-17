import { describe, expect, it } from "vitest";
import type { ApprovalRequest } from "../../../types";
import {
  createInitialThreadState,
  threadReducer,
} from "./useThreadsReducer";

describe("threadReducer approvals", () => {
  it("keeps a newer approval when an older approval with the same request id is removed", () => {
    const previousApproval: ApprovalRequest = {
      workspace_id: "ws-1",
      request_id: "shared-request",
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "claude:thread-1",
        turnId: "turn-1",
        file_path: "bbb.txt",
      },
    };
    const nextApproval: ApprovalRequest = {
      workspace_id: "ws-1",
      request_id: "shared-request",
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "claude:thread-1",
        turnId: "turn-2",
        file_path: "ccc.txt",
      },
    };

    let state = createInitialThreadState();
    state = threadReducer(state, { type: "addApproval", approval: previousApproval });
    state = threadReducer(state, { type: "addApproval", approval: nextApproval });

    expect(state.approvals).toEqual([previousApproval, nextApproval]);

    state = threadReducer(state, {
      type: "removeApproval",
      requestId: previousApproval.request_id,
      workspaceId: previousApproval.workspace_id,
      approval: previousApproval,
    });

    expect(state.approvals).toEqual([nextApproval]);
  });
});
