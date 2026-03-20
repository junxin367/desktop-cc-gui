import type {
  KanbanNewThreadResultMode,
  KanbanRecurringUnit,
  KanbanRecurringExecutionMode,
  KanbanTask,
  KanbanTaskStatus,
  KanbanTaskExecutionSource,
  KanbanTaskSchedule,
} from "../types";

const UNIT_TO_MS: Record<KanbanRecurringUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

export type KanbanScheduleFormValue = {
  mode: "manual" | "once" | "recurring";
  runAtText?: string;
  interval?: number;
  unit?: KanbanRecurringUnit;
  timezone?: string | null;
  recurringExecutionMode?: KanbanRecurringExecutionMode;
  newThreadResultMode?: KanbanNewThreadResultMode;
  maxRounds?: number | null;
};

export type KanbanScheduleBuildResult =
  | { ok: true; schedule: KanbanTaskSchedule | undefined }
  | { ok: false; reason: string };

type MissedRunPolicyResult = {
  schedule: KanbanTaskSchedule;
  blockedReason: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeUnit(value: unknown): KanbanRecurringUnit | null {
  if (
    value === "minutes" ||
    value === "hours" ||
    value === "days" ||
    value === "weeks"
  ) {
    return value;
  }
  return null;
}

function normalizeRecurringExecutionMode(value: unknown): KanbanRecurringExecutionMode {
  return value === "new_thread" ? "new_thread" : "same_thread";
}

function normalizeNewThreadResultMode(value: unknown): KanbanNewThreadResultMode {
  return value === "none" ? "none" : "pass";
}

function normalizeMaxRounds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.floor(value);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > 50) {
    return 50;
  }
  return rounded;
}

export function normalizeTaskSchedule(raw: unknown): KanbanTaskSchedule | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const mode = input.mode;
  if (mode !== "manual" && mode !== "once" && mode !== "recurring") {
    return undefined;
  }
  const unit = normalizeUnit(input.unit);
  return {
    mode,
    seriesId: typeof input.seriesId === "string" ? input.seriesId : null,
    paused: Boolean(input.paused),
    pausedRemainingMs: toNumber(input.pausedRemainingMs),
    runAt: toNumber(input.runAt),
    interval: toNumber(input.interval),
    unit,
    timezone: typeof input.timezone === "string" ? input.timezone : null,
    nextRunAt: toNumber(input.nextRunAt),
    lastTriggeredAt: toNumber(input.lastTriggeredAt),
    lastTriggerSource:
      input.lastTriggerSource === "manual" ||
      input.lastTriggerSource === "autoStart" ||
      input.lastTriggerSource === "drag" ||
      input.lastTriggerSource === "scheduled" ||
      input.lastTriggerSource === "chained"
        ? input.lastTriggerSource
        : null,
    overdue: Boolean(input.overdue),
    recurringExecutionMode: normalizeRecurringExecutionMode(input.recurringExecutionMode),
    newThreadResultMode: normalizeNewThreadResultMode(input.newThreadResultMode),
    maxRounds: normalizeMaxRounds(input.maxRounds),
    completedRounds: toNumber(input.completedRounds),
  };
}

export function computeNextFutureRecurringRunAt(
  anchorTs: number,
  nowTs: number,
  interval: number,
  unit: KanbanRecurringUnit,
): number | null {
  if (!Number.isFinite(anchorTs) || !Number.isFinite(nowTs)) {
    return null;
  }
  if (!Number.isInteger(interval) || interval <= 0) {
    return null;
  }
  const stepMs = UNIT_TO_MS[unit] * interval;
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    return null;
  }
  if (anchorTs > nowTs) {
    return anchorTs;
  }
  const delta = nowTs - anchorTs;
  const jumps = Math.floor(delta / stepMs) + 1;
  return anchorTs + jumps * stepMs;
}

export function buildTaskScheduleFromForm(
  value: KanbanScheduleFormValue,
  nowTs = Date.now(),
): KanbanScheduleBuildResult {
  if (value.mode === "manual") {
    return { ok: true, schedule: undefined };
  }

  if (value.mode === "once") {
    const parsed = Date.parse(value.runAtText ?? "");
    if (!Number.isFinite(parsed)) {
      return { ok: false, reason: "invalid_once_time" };
    }
    return {
      ok: true,
      schedule: {
        mode: "once",
        paused: false,
        pausedRemainingMs: null,
        runAt: parsed,
        timezone: value.timezone ?? null,
        nextRunAt: parsed,
        overdue: false,
      },
    };
  }

  const interval = Math.floor(value.interval ?? 0);
  const unit = value.unit ?? "days";
  if (!Number.isInteger(interval) || interval <= 0) {
    return { ok: false, reason: "invalid_recurring_interval" };
  }
  const nextRunAt = computeNextFutureRecurringRunAt(
    nowTs + UNIT_TO_MS[unit] * interval,
    nowTs,
    interval,
    unit,
  );
  if (!nextRunAt) {
    return { ok: false, reason: "invalid_recurring_rule" };
  }
  return {
    ok: true,
    schedule: {
      mode: "recurring",
      seriesId: null,
      paused: false,
      pausedRemainingMs: null,
      interval,
      unit,
      timezone: value.timezone ?? null,
      nextRunAt,
      overdue: false,
      recurringExecutionMode: value.recurringExecutionMode ?? "same_thread",
      newThreadResultMode:
        (value.recurringExecutionMode ?? "same_thread") === "new_thread"
          ? (value.newThreadResultMode ?? "pass")
          : "pass",
      maxRounds:
        (value.recurringExecutionMode ?? "same_thread") === "same_thread"
          ? normalizeMaxRounds(value.maxRounds) ?? 10
          : null,
      completedRounds: 0,
    },
  };
}

export function isScheduleDue(schedule: KanbanTaskSchedule, nowTs: number): boolean {
  return typeof schedule.nextRunAt === "number" && schedule.nextRunAt <= nowTs;
}

export function applyMissedRunPolicy(
  task: KanbanTask,
  schedulerStartedAt: number,
  nowTs: number,
): MissedRunPolicyResult | null {
  const schedule = task.schedule;
  if (!schedule || (schedule.mode !== "once" && schedule.mode !== "recurring")) {
    return null;
  }
  const nextRunAt = schedule.nextRunAt;
  if (typeof nextRunAt !== "number" || nextRunAt >= schedulerStartedAt) {
    return null;
  }

  if (schedule.mode === "once") {
    return {
      schedule: {
        ...schedule,
        nextRunAt: null,
        overdue: true,
      },
      blockedReason: "missed_once_window",
    };
  }

  const unit = schedule.unit ?? "days";
  const interval = schedule.interval ?? 1;
  const nextFuture = computeNextFutureRecurringRunAt(nextRunAt, nowTs, interval, unit);
  if (!nextFuture) {
    return {
      schedule: {
        ...schedule,
      },
      blockedReason: "invalid_recurring_rule",
    };
  }
  return {
    schedule: {
      ...schedule,
      nextRunAt: nextFuture,
      overdue: false,
    },
    blockedReason: "skipped_missed_recurring_windows",
  };
}

export function markScheduleTriggered(
  schedule: KanbanTaskSchedule,
  source: KanbanTaskExecutionSource,
  triggeredAt = Date.now(),
): KanbanTaskSchedule {
  if (schedule.mode === "once") {
    return {
      ...schedule,
      paused: false,
      pausedRemainingMs: null,
      nextRunAt: null,
      overdue: false,
      lastTriggeredAt: triggeredAt,
      lastTriggerSource: source,
    };
  }
  if (schedule.mode === "recurring") {
    const unit = schedule.unit ?? "days";
    const interval = schedule.interval ?? 1;
    const anchor = schedule.nextRunAt ?? triggeredAt;
    const nextRunAt = computeNextFutureRecurringRunAt(
      anchor,
      triggeredAt,
      interval,
      unit,
    );
    return {
      ...schedule,
      paused: false,
      pausedRemainingMs: null,
      nextRunAt,
      overdue: false,
      lastTriggeredAt: triggeredAt,
      lastTriggerSource: source,
    };
  }
  return schedule;
}

export function markRecurringScheduleCompleted(
  schedule: KanbanTaskSchedule,
  source: KanbanTaskExecutionSource,
  completedAt = Date.now(),
): KanbanTaskSchedule {
  if (schedule.mode !== "recurring") {
    return schedule;
  }
  const unit = schedule.unit ?? "days";
  const interval = schedule.interval ?? 1;
  const stepMs = UNIT_TO_MS[unit] * interval;
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    return {
      ...schedule,
      lastTriggeredAt: completedAt,
      lastTriggerSource: source,
      completedRounds: (schedule.completedRounds ?? 0) + 1,
    };
  }
  return {
    ...schedule,
    paused: false,
    pausedRemainingMs: null,
    // Re-base recurring cycle on successful completion time to avoid immediate re-trigger.
    nextRunAt: completedAt + stepMs,
    overdue: false,
    lastTriggeredAt: completedAt,
    lastTriggerSource: source,
    completedRounds: (schedule.completedRounds ?? 0) + 1,
  };
}

export function describeSchedule(schedule?: KanbanTaskSchedule): string | null {
  if (!schedule) {
    return null;
  }
  if (schedule.mode === "once") {
    if (!schedule.nextRunAt && schedule.overdue) {
      return "once_overdue";
    }
    return "once";
  }
  if (schedule.mode === "recurring") {
    return "recurring";
  }
  return null;
}

export function resolvePostProcessingStatus(task: Pick<KanbanTask, "status" | "schedule">): KanbanTaskStatus {
  if (task.status !== "inprogress") {
    return task.status;
  }
  if (task.schedule?.mode !== "recurring") {
    return "testing";
  }
  return task.schedule.recurringExecutionMode === "new_thread" ? "testing" : "todo";
}

export function hasReachedRecurringRoundLimit(schedule: KanbanTaskSchedule): boolean {
  if (schedule.mode !== "recurring") {
    return false;
  }
  if (schedule.recurringExecutionMode !== "same_thread") {
    return false;
  }
  if (typeof schedule.maxRounds !== "number" || schedule.maxRounds <= 0) {
    return false;
  }
  return (schedule.completedRounds ?? 0) >= schedule.maxRounds;
}
