import { describe, expect, it } from "vitest";
import type { KanbanTask } from "../types";
import {
  applyMissedRunPolicy,
  buildTaskScheduleFromForm,
  computeNextFutureRecurringRunAt,
  hasReachedRecurringRoundLimit,
  markRecurringScheduleCompleted,
  markScheduleTriggered,
  resolvePostProcessingStatus,
} from "./scheduling";

function createBaseTask(overrides: Partial<KanbanTask>): KanbanTask {
  const now = 1_700_000_000_000;
  return {
    id: "task-1",
    workspaceId: "/workspace",
    panelId: "panel-1",
    title: "Task",
    description: "desc",
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

describe("kanban scheduling utils", () => {
  it("builds one-time schedule from datetime input", () => {
    const result = buildTaskScheduleFromForm({
      mode: "once",
      runAtText: "2030-01-01T09:30",
      timezone: "Asia/Shanghai",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.schedule?.mode).toBe("once");
    expect(result.schedule?.nextRunAt).toBeTypeOf("number");
    expect(result.schedule?.timezone).toBe("Asia/Shanghai");
  });

  it("marks missed one-time runs as overdue without replay", () => {
    const task = createBaseTask({
      schedule: {
        mode: "once",
        runAt: 1000,
        nextRunAt: 1000,
      },
    });
    const policy = applyMissedRunPolicy(task, 10_000, 20_000);
    expect(policy).not.toBeNull();
    expect(policy?.schedule.nextRunAt).toBeNull();
    expect(policy?.schedule.overdue).toBe(true);
    expect(policy?.blockedReason).toBe("missed_once_window");
  });

  it("collapses missed recurring windows to next future occurrence", () => {
    const task = createBaseTask({
      schedule: {
        mode: "recurring",
        interval: 1,
        unit: "hours",
        nextRunAt: 1_000,
      },
    });
    const policy = applyMissedRunPolicy(task, 10_000, 3_650_000);
    expect(policy).not.toBeNull();
    expect(policy?.schedule.nextRunAt).toBeGreaterThan(3_650_000);
    expect(policy?.blockedReason).toBe("skipped_missed_recurring_windows");
  });

  it("advances recurring schedule after trigger", () => {
    const next = computeNextFutureRecurringRunAt(1000, 1000, 2, "hours");
    expect(next).toBe(7_201_000);
    const triggered = markScheduleTriggered(
      {
        mode: "recurring",
        interval: 2,
        unit: "hours",
        nextRunAt: 1000,
      },
      "scheduled",
      1000,
    );
    expect(triggered.nextRunAt).toBe(7_201_000);
    expect(triggered.lastTriggerSource).toBe("scheduled");
  });

  it("returns recurring tasks to todo after processing ends", () => {
    const recurringTask = createBaseTask({
      status: "inprogress",
      schedule: {
        mode: "recurring",
        interval: 1,
        unit: "minutes",
        nextRunAt: Date.now() + 60_000,
        recurringExecutionMode: "same_thread",
      },
    });
    const recurringNewThreadTask = createBaseTask({
      status: "inprogress",
      schedule: {
        mode: "recurring",
        interval: 1,
        unit: "minutes",
        nextRunAt: Date.now() + 60_000,
        recurringExecutionMode: "new_thread",
      },
    });
    const onceTask = createBaseTask({
      status: "inprogress",
      schedule: {
        mode: "once",
        runAt: Date.now() + 60_000,
        nextRunAt: Date.now() + 60_000,
      },
    });

    expect(resolvePostProcessingStatus(recurringTask)).toBe("todo");
    expect(resolvePostProcessingStatus(recurringNewThreadTask)).toBe("testing");
    expect(resolvePostProcessingStatus(onceTask)).toBe("testing");
  });

  it("re-bases recurring next run on completion time", () => {
    const completed = markRecurringScheduleCompleted(
      {
        mode: "recurring",
        interval: 1,
        unit: "minutes",
        nextRunAt: 1_000,
      },
      "scheduled",
      120_000,
    );
    expect(completed.nextRunAt).toBe(180_000);
    expect(completed.lastTriggerSource).toBe("scheduled");
    expect(completed.lastTriggeredAt).toBe(120_000);
    expect(completed.completedRounds).toBe(1);
  });

  it("detects recurring round limit for same-thread mode", () => {
    expect(
      hasReachedRecurringRoundLimit({
        mode: "recurring",
        recurringExecutionMode: "same_thread",
        maxRounds: 5,
        completedRounds: 4,
      }),
    ).toBe(false);
    expect(
      hasReachedRecurringRoundLimit({
        mode: "recurring",
        recurringExecutionMode: "same_thread",
        maxRounds: 5,
        completedRounds: 5,
      }),
    ).toBe(true);
    expect(
      hasReachedRecurringRoundLimit({
        mode: "recurring",
        recurringExecutionMode: "new_thread",
        maxRounds: 5,
        completedRounds: 10,
      }),
    ).toBe(false);
  });
});
