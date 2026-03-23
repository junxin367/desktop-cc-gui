/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineStatus } from "../../../types";
import { generateThreadTitle } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { TaskCreateModal } from "./TaskCreateModal";

vi.mock("../../../services/tauri", async () => {
  const actual = await vi.importActual<typeof import("../../../services/tauri")>(
    "../../../services/tauri",
  );
  return {
    ...actual,
    pickImageFiles: vi.fn().mockResolvedValue([]),
    generateThreadTitle: vi.fn(),
  };
});

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

const engineStatuses: EngineStatus[] = [
  {
    engineType: "claude",
    installed: true,
    version: "1.0.0",
    binPath: "/usr/local/bin/claude",
    features: {
      streaming: true,
      reasoning: true,
      toolUse: true,
      imageInput: true,
      sessionContinuation: true,
    },
    models: [
      {
        id: "claude-sonnet",
        displayName: "Claude Sonnet",
        description: "Default model",
        isDefault: true,
      },
    ],
    error: null,
  },
];

describe("TaskCreateModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens correctly after an initial closed render", () => {
    const props = {
      workspaceId: "ws-1",
      workspaceBackendId: "ws-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      availableTasks: [],
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { container, rerender } = render(
      <TaskCreateModal {...props} isOpen={false} />,
    );

    expect(container.querySelector(".kanban-task-modal")).toBeNull();

    expect(() => {
      rerender(<TaskCreateModal {...props} isOpen />);
    }).not.toThrow();

    expect(container.querySelector(".kanban-task-modal")).not.toBeNull();
  });

  it("uses backend workspace id for title generation", async () => {
    vi.mocked(generateThreadTitle).mockResolvedValue("Generated Title");

    const props = {
      workspaceId: "/tmp/workspace",
      workspaceBackendId: "workspace-uuid-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      availableTasks: [],
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { getByPlaceholderText, getByTitle, getByDisplayValue } = render(
      <TaskCreateModal {...props} isOpen />,
    );

    fireEvent.change(
      getByPlaceholderText("kanban.task.descPlaceholder"),
      { target: { value: "fix login bug" } },
    );

    fireEvent.click(getByTitle("kanban.task.generateTitle"));

    await waitFor(() => {
      expect(generateThreadTitle).toHaveBeenCalledWith(
        "workspace-uuid-1",
        "temp-title-gen",
        "fix login bug",
        "en",
      );
    });

    expect(getByDisplayValue("Generated Title")).toBeTruthy();
    expect(pushErrorToast).not.toHaveBeenCalled();
  });

  it("shows timeout toast when title generation exceeds 15s", async () => {
    vi.useFakeTimers();
    vi.mocked(generateThreadTitle).mockImplementation(
      () => new Promise(() => {}),
    );

    const props = {
      workspaceId: "/tmp/workspace",
      workspaceBackendId: "workspace-uuid-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      availableTasks: [],
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { getByPlaceholderText, getByTitle } = render(
      <TaskCreateModal {...props} isOpen />,
    );

    fireEvent.change(
      getByPlaceholderText("kanban.task.descPlaceholder"),
      { target: { value: "fix login bug" } },
    );

    fireEvent.click(getByTitle("kanban.task.generateTitle"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001);
    });

    expect(pushErrorToast).toHaveBeenCalledWith({
      title: "kanban.task.generateTitleFailed",
      message: "kanban.task.generateTitleTimeout",
    });
  });

  it("clears blocked reason when updating an edited task", async () => {
    const onUpdate = vi.fn();
    const editingTask = {
      id: "task-1",
      workspaceId: "ws-1",
      panelId: "panel-1",
      title: "Recurring task",
      description: "desc",
      status: "todo",
      engineType: "claude",
      modelId: "claude-sonnet",
      branchName: "main",
      images: [],
      autoStart: false,
      sortOrder: 1,
      threadId: null,
      schedule: {
        mode: "recurring",
        interval: 1,
        unit: "minutes",
        nextRunAt: Date.now() + 60_000,
      },
      execution: {
        lastSource: "manual",
        blockedReason: "manual_blocked",
      },
      createdAt: 1,
      updatedAt: 1,
    } as any;

    const props = {
      workspaceId: "ws-1",
      workspaceBackendId: "ws-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      availableTasks: [editingTask],
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      editingTask,
      onUpdate,
    };

    const { getByText } = render(<TaskCreateModal {...props} isOpen />);
    fireEvent.click(getByText("kanban.task.update"));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });

    const [, changes] = onUpdate.mock.calls[0];
    expect(changes.execution?.blockedReason).toBeNull();
  });

  it("shows upstream task type labels in chain selector options", () => {
    const props = {
      workspaceId: "ws-1",
      workspaceBackendId: "ws-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      availableTasks: [
        {
          id: "task-manual",
          workspaceId: "ws-1",
          panelId: "panel-1",
          title: "Manual task",
          description: "",
          status: "todo",
          engineType: "claude",
          modelId: "claude-sonnet",
          branchName: "main",
          images: [],
          autoStart: false,
          sortOrder: 1,
          threadId: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "task-once",
          workspaceId: "ws-1",
          panelId: "panel-1",
          title: "One-time task",
          description: "",
          status: "todo",
          engineType: "claude",
          modelId: "claude-sonnet",
          branchName: "main",
          images: [],
          autoStart: false,
          sortOrder: 2,
          threadId: null,
          schedule: {
            mode: "once",
            runAt: Date.now() + 60_000,
          },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "task-recurring",
          workspaceId: "ws-1",
          panelId: "panel-1",
          title: "Recurring task",
          description: "",
          status: "todo",
          engineType: "claude",
          modelId: "claude-sonnet",
          branchName: "main",
          images: [],
          autoStart: false,
          sortOrder: 3,
          threadId: null,
          schedule: {
            mode: "recurring",
            interval: 1,
            unit: "days",
            nextRunAt: Date.now() + 60_000,
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ] as any,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { getByRole } = render(<TaskCreateModal {...props} isOpen />);

    expect(
      getByRole("option", { name: "[kanban.task.schedule.manual] Manual task" }),
    ).toBeTruthy();
    expect(
      getByRole("option", { name: "[kanban.task.schedule.once] One-time task" }),
    ).toBeTruthy();
    expect(
      getByRole("option", { name: "[kanban.task.schedule.recurring] Recurring task" }),
    ).toBeTruthy();
  });

  it("shows start toggle only for manual schedule mode", () => {
    const props = {
      workspaceId: "ws-1",
      workspaceBackendId: "ws-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      availableTasks: [],
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { getByRole, queryByText } = render(<TaskCreateModal {...props} isOpen />);

    expect(queryByText("kanban.task.start")).toBeTruthy();
    fireEvent.click(getByRole("radio", { name: "kanban.task.schedule.once" }));
    expect(queryByText("kanban.task.start")).toBeNull();
    fireEvent.click(getByRole("radio", { name: "kanban.task.schedule.manual" }));
    expect(queryByText("kanban.task.start")).toBeTruthy();
  });

  it("forces autoStart off when switching to non-manual schedule", async () => {
    const onSubmit = vi.fn();
    const props = {
      workspaceId: "ws-1",
      workspaceBackendId: "ws-1",
      panelId: "panel-1",
      defaultStatus: "inprogress" as const,
      engineStatuses,
      availableTasks: [],
      onSubmit,
      onCancel: vi.fn(),
    };

    const { container, getByPlaceholderText, getByRole, getByText } = render(
      <TaskCreateModal {...props} isOpen />,
    );

    const startToggle = container.querySelector(".kanban-toggle-input") as HTMLInputElement;
    expect(startToggle?.checked).toBe(true);

    fireEvent.click(getByRole("radio", { name: "kanban.task.schedule.recurring" }));
    fireEvent.change(getByPlaceholderText("kanban.task.titlePlaceholder"), {
      target: { value: "Recurring task" },
    });
    fireEvent.click(getByText("kanban.task.create"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit.mock.calls[0][0].autoStart).toBe(false);
    expect(onSubmit.mock.calls[0][0].schedule?.mode).toBe("recurring");
  });
});
