import type {
  KanbanScheduleMode,
  KanbanTask,
  KanbanTaskChain,
  KanbanTaskStatus,
} from "../types";

export type ChainValidationResult =
  | { ok: true; groupId: string | null }
  | { ok: false; reason: string };

function findTask(tasks: KanbanTask[], taskId: string): KanbanTask | undefined {
  return tasks.find((task) => task.id === taskId);
}

function findDownstreamTask(
  tasks: KanbanTask[],
  upstreamTaskId: string,
  excludeTaskId?: string,
): KanbanTask | undefined {
  return tasks.find(
    (task) =>
      task.id !== excludeTaskId &&
      task.chain?.previousTaskId === upstreamTaskId,
  );
}

function collectAncestorIds(tasks: KanbanTask[], taskId: string): Set<string> {
  const visited = new Set<string>();
  let currentTask = findTask(tasks, taskId);
  while (currentTask?.chain?.previousTaskId) {
    const previousId = currentTask.chain.previousTaskId;
    if (visited.has(previousId)) {
      break;
    }
    visited.add(previousId);
    currentTask = findTask(tasks, previousId);
  }
  return visited;
}

function resolveGroupId(tasks: KanbanTask[], previousTaskId: string): string {
  const previous = findTask(tasks, previousTaskId);
  return previous?.chain?.groupId ?? previousTaskId;
}

function isValidGroupCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{3}$/.test(value);
}

function generateGroupCode(existingCodes: Set<string>): string {
  for (let attempt = 0; attempt < 900; attempt += 1) {
    const candidate = `${Math.floor(Math.random() * 900) + 100}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }
  return `${Math.floor(Math.random() * 900) + 100}`;
}

function resolveGroupCode(
  tasks: KanbanTask[],
  groupId: string,
  previousTaskId: string,
): string {
  const previous = findTask(tasks, previousTaskId);
  if (isValidGroupCode(previous?.chain?.groupCode)) {
    return previous.chain.groupCode;
  }
  const sameGroupCode = tasks.find(
    (task) => task.chain?.groupId === groupId && isValidGroupCode(task.chain?.groupCode),
  )?.chain?.groupCode;
  if (isValidGroupCode(sameGroupCode)) {
    return sameGroupCode;
  }
  const existingCodes = new Set(
    tasks
      .map((task) => task.chain?.groupCode)
      .filter((code): code is string => isValidGroupCode(code)),
  );
  return generateGroupCode(existingCodes);
}

export function validateChainSelection(input: {
  tasks: KanbanTask[];
  taskId?: string;
  status: KanbanTaskStatus;
  previousTaskId: string | null;
  scheduleMode: KanbanScheduleMode;
}): ChainValidationResult {
  const { tasks, taskId, status, previousTaskId, scheduleMode } = input;

  if (!previousTaskId) {
    return { ok: true, groupId: null };
  }

  if (status !== "todo") {
    return { ok: false, reason: "chain_requires_todo_task" };
  }

  if (scheduleMode !== "manual") {
    return { ok: false, reason: "downstream_cannot_be_scheduled" };
  }

  if (taskId && previousTaskId === taskId) {
    return { ok: false, reason: "chain_self_cycle" };
  }

  const previous = findTask(tasks, previousTaskId);
  if (!previous) {
    return { ok: false, reason: "chain_previous_not_found" };
  }
  if (previous.status !== "todo") {
    return { ok: false, reason: "chain_requires_todo_upstream" };
  }

  const downstream = findDownstreamTask(tasks, previousTaskId, taskId);
  if (downstream) {
    return { ok: false, reason: "chain_multi_downstream" };
  }

  if (taskId) {
    const ancestors = collectAncestorIds(tasks, previousTaskId);
    if (ancestors.has(taskId)) {
      return { ok: false, reason: "chain_cycle_detected" };
    }
  }

  return { ok: true, groupId: resolveGroupId(tasks, previousTaskId) };
}

export function buildTaskChain(
  tasks: KanbanTask[],
  previousTaskId: string | null,
): KanbanTaskChain | undefined {
  if (!previousTaskId) {
    return undefined;
  }
  const groupId = resolveGroupId(tasks, previousTaskId);
  const groupCode = resolveGroupCode(tasks, groupId, previousTaskId);
  return {
    groupId,
    previousTaskId,
    groupCode,
    blockedReason: null,
  };
}

export function findTaskDownstream(
  tasks: KanbanTask[],
  upstreamTaskId: string,
): KanbanTask | undefined {
  return findDownstreamTask(tasks, upstreamTaskId);
}

export function chainPositionOfTask(tasks: KanbanTask[], taskId: string): number {
  let position = 1;
  let current = findTask(tasks, taskId);
  const visited = new Set<string>();
  while (current?.chain?.previousTaskId) {
    const previousId = current.chain.previousTaskId;
    if (visited.has(previousId)) {
      break;
    }
    visited.add(previousId);
    position += 1;
    current = findTask(tasks, previousId);
  }
  return position;
}
