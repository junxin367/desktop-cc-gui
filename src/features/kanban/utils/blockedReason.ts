import type { TFunction } from "i18next";

const BLOCKED_REASON_KEY_MAP: Record<string, string> = {
  non_reentrant_trigger_blocked: "kanban.task.blockedReason.nonReentrant",
  missed_once_window: "kanban.task.blockedReason.missedOnceWindow",
  invalid_recurring_rule: "kanban.task.blockedReason.invalidRecurringRule",
  skipped_missed_recurring_windows: "kanban.task.blockedReason.skippedMissedRecurringWindows",
  max_rounds_reached_auto_completed: "kanban.task.blockedReason.maxRoundsReached",
  missing_upstream_snapshot: "kanban.task.blockedReason.missingUpstreamSnapshot",
  downstream_not_todo: "kanban.task.blockedReason.downstreamNotTodo",
  downstream_has_schedule: "kanban.task.blockedReason.downstreamHasSchedule",
  chain_requires_head_trigger: "kanban.task.blockedReason.chainRequiresHeadTrigger",
  scheduled_trigger_blocked: "kanban.task.blockedReason.scheduledTriggerBlocked",
  drag_into_chain_group_blocked: "kanban.task.blockedReason.dragIntoChainGroupBlocked",
  manual_blocked: "kanban.task.blockedReason.manualBlocked",
  manual_cancelled: "kanban.task.blockedReason.manualCancelled",
};

export function formatKanbanBlockedReason(
  t: TFunction,
  reason: string | null | undefined,
): string {
  if (!reason) {
    return "";
  }
  const key = BLOCKED_REASON_KEY_MAP[reason];
  if (!key) {
    return reason;
  }
  return t(key);
}
