// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useKanbanStore } from "./useKanbanStore";
import type { KanbanTask } from "../types";

describe("useKanbanStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps auto-start tasks in todo before launch is completed", () => {
    const { result } = renderHook(() => useKanbanStore());

    let createdTask!: KanbanTask;
    act(() => {
      createdTask = result.current.createTask({
        workspaceId: "ws-1",
        panelId: "panel-1",
        title: "Auto start task",
        description: "desc",
        engineType: "claude",
        modelId: null,
        branchName: "main",
        images: [],
        autoStart: true,
      });
    });

    expect(createdTask.status).toBe("todo");
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]?.status).toBe("todo");
    expect(result.current.tasks[0]?.execution?.lastSource).toBe("autoStart");
  });
});
