import { describe, expect, it } from "vitest";
import type { KanbanTask } from "../types";
import { buildTaskChain, validateChainSelection } from "./chaining";

function createTask(id: string, overrides: Partial<KanbanTask> = {}): KanbanTask {
  const now = 1_700_000_000_000;
  return {
    id,
    workspaceId: "/workspace",
    panelId: "panel-1",
    title: id,
    description: "",
    status: "todo",
    engineType: "claude",
    modelId: null,
    branchName: "main",
    images: [],
    autoStart: false,
    sortOrder: now,
    threadId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("kanban chaining utils", () => {
  it("rejects non-todo task as downstream", () => {
    const tasks = [createTask("A"), createTask("B", { status: "done" })];
    const result = validateChainSelection({
      tasks,
      taskId: "B",
      status: "done",
      previousTaskId: "A",
      scheduleMode: "manual",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("chain_requires_todo_task");
  });

  it("rejects upstream with multiple downstream tasks", () => {
    const tasks = [
      createTask("A"),
      createTask("B", {
        chain: { groupId: "A", previousTaskId: "A" },
      }),
      createTask("C"),
    ];
    const result = validateChainSelection({
      tasks,
      taskId: "C",
      status: "todo",
      previousTaskId: "A",
      scheduleMode: "manual",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("chain_multi_downstream");
  });

  it("rejects cycle when selecting upstream", () => {
    const tasks = [
      createTask("A", {
        chain: { groupId: "A", previousTaskId: "C" },
      }),
      createTask("B", {
        chain: { groupId: "A", previousTaskId: "A" },
      }),
      createTask("C", {
        chain: { groupId: "A", previousTaskId: "B" },
      }),
    ];
    const result = validateChainSelection({
      tasks,
      taskId: "A",
      status: "todo",
      previousTaskId: "C",
      scheduleMode: "manual",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("chain_cycle_detected");
  });

  it("builds chain metadata with inherited group id", () => {
    const tasks = [
      createTask("A", {
        chain: { groupId: "group-1", previousTaskId: null, groupCode: "321" },
      }),
      createTask("B"),
    ];
    const chain = buildTaskChain(tasks, "A");
    expect(chain?.groupId).toBe("group-1");
    expect(chain?.previousTaskId).toBe("A");
    expect(chain?.groupCode).toBe("321");
  });

  it("generates a 3-digit group code for new chain groups", () => {
    const tasks = [createTask("A"), createTask("B")];
    const chain = buildTaskChain(tasks, "A");
    expect(chain?.groupId).toBe("A");
    expect(chain?.groupCode).toMatch(/^\d{3}$/);
  });
});
