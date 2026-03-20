import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Droppable } from "@hello-pangea/dnd";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { KanbanColumnDef, KanbanTask } from "../types";
import { KanbanCard } from "./KanbanCard";
import { chainPositionOfTask } from "../utils/chaining";

type KanbanColumnProps = {
  column: KanbanColumnDef;
  tasks: KanbanTask[];
  allTasks: KanbanTask[];
  selectedTaskId: string | null;
  taskProcessingMap: Record<string, { isProcessing: boolean; startedAt: number | null }>;
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onToggleSchedulePausedTask: (task: KanbanTask) => void;
  onCancelOrBlockTask: (task: KanbanTask) => void;
  onSelectTask: (task: KanbanTask) => void;
  onEditTask?: (task: KanbanTask) => void;
};

type TaskGroupKind = "recurring" | "chain";

type TaskGroupMeta = {
  key: string;
  kind: TaskGroupKind;
  groupId: string | null;
  groupCode: string | null;
  count: number;
};

type TaskGroupRef = {
  key: string;
  kind: TaskGroupKind;
};

type TaskRenderBlock =
  | { type: "single"; task: KanbanTask }
  | { type: "group"; meta: TaskGroupMeta; tasks: KanbanTask[] };

type RecurringGroupDescriptor = {
  signature: string;
  seriesId: string | null;
};

function resolveRecurringGroupDescriptor(task: KanbanTask): RecurringGroupDescriptor | null {
  const schedule = task.schedule;
  if (
    schedule?.mode !== "recurring" ||
    schedule.recurringExecutionMode !== "new_thread"
  ) {
    return null;
  }
  const signature = [
    task.workspaceId,
    task.panelId,
    task.title,
    String(schedule.interval ?? 1),
    schedule.unit ?? "days",
    schedule.newThreadResultMode ?? "pass",
  ].join("|");
  const seriesId =
    typeof schedule.seriesId === "string" && schedule.seriesId.trim().length > 0
      ? schedule.seriesId.trim()
      : null;
  return { signature, seriesId };
}

function resolveChainGroupCode(allTasks: KanbanTask[], groupId: string): string {
  const existingCode = allTasks.find(
    (task) => task.chain?.groupId === groupId && /^\d{3}$/.test(task.chain?.groupCode ?? ""),
  )?.chain?.groupCode;
  if (existingCode) {
    return existingCode;
  }

  // Stable fallback for legacy data without groupCode.
  let hash = 0;
  for (const ch of groupId) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `${(hash % 900) + 100}`;
}

function resolveTaskChainGroupId(allTasks: KanbanTask[], task: KanbanTask): string | null {
  if (task.chain?.groupId) {
    return task.chain.groupId;
  }
  return (
    allTasks.find((entry) => entry.chain?.previousTaskId === task.id)?.chain?.groupId ??
    null
  );
}

export function KanbanColumn({
  column,
  tasks,
  allTasks,
  selectedTaskId,
  taskProcessingMap,
  onAddTask,
  onDeleteTask,
  onToggleSchedulePausedTask,
  onCancelOrBlockTask,
  onSelectTask,
  onEditTask,
}: KanbanColumnProps) {
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const renderBlocks = useMemo<TaskRenderBlock[]>(() => {
    const chainGroupByTaskId = new Map<string, string>();
    for (const task of allTasks) {
      if (!task.chain?.groupId) {
        continue;
      }
      chainGroupByTaskId.set(task.id, task.chain.groupId);
      if (task.chain.previousTaskId) {
        chainGroupByTaskId.set(task.chain.previousTaskId, task.chain.groupId);
      }
    }

    const taskGroupByTaskId = new Map<string, TaskGroupRef>();
    const groupedTaskIdsByKey = new Map<string, string[]>();
    const groupedKindByKey = new Map<string, TaskGroupKind>();

    const recurringDescriptors = new Map<string, RecurringGroupDescriptor>();
    const recurringSeriesBySignature = new Map<string, Set<string>>();
    for (const task of tasks) {
      const descriptor = resolveRecurringGroupDescriptor(task);
      if (!descriptor) {
        continue;
      }
      recurringDescriptors.set(task.id, descriptor);
      if (descriptor.seriesId) {
        const current = recurringSeriesBySignature.get(descriptor.signature) ?? new Set<string>();
        current.add(descriptor.seriesId);
        recurringSeriesBySignature.set(descriptor.signature, current);
      }
    }

    for (const task of tasks) {
      const recurringDescriptor = recurringDescriptors.get(task.id);
      if (recurringDescriptor) {
        const signatureSeries = recurringSeriesBySignature.get(recurringDescriptor.signature);
        const hasSingleSeries = (signatureSeries?.size ?? 0) === 1;
        const preferredSeriesId =
          recurringDescriptor.seriesId ??
          (hasSingleSeries ? Array.from(signatureSeries as Set<string>)[0] : null);
        const recurringGroupKey = preferredSeriesId
          ? `recurring:${preferredSeriesId}`
          : `recurring:sig:${recurringDescriptor.signature}`;
        taskGroupByTaskId.set(task.id, { key: recurringGroupKey, kind: "recurring" });
        groupedKindByKey.set(recurringGroupKey, "recurring");
        groupedTaskIdsByKey.set(recurringGroupKey, [
          ...(groupedTaskIdsByKey.get(recurringGroupKey) ?? []),
          task.id,
        ]);
        continue;
      }

      const chainGroupId = task.chain?.groupId ?? chainGroupByTaskId.get(task.id);
      if (!chainGroupId) {
        continue;
      }
      const chainGroupKey = `chain:${chainGroupId}`;
      taskGroupByTaskId.set(task.id, { key: chainGroupKey, kind: "chain" });
      groupedKindByKey.set(chainGroupKey, "chain");
      groupedTaskIdsByKey.set(chainGroupKey, [
        ...(groupedTaskIdsByKey.get(chainGroupKey) ?? []),
        task.id,
      ]);
    }

    const groupMetaByKey = new Map<string, TaskGroupMeta>();
    for (const [groupKey, taskIds] of groupedTaskIdsByKey.entries()) {
      if (taskIds.length < 2) {
        continue;
      }
      const kind = groupedKindByKey.get(groupKey) ?? "chain";
      groupMetaByKey.set(groupKey, {
        key: groupKey,
        kind,
        groupId: kind === "chain" ? groupKey.replace(/^chain:/, "") : null,
        groupCode:
          kind === "chain"
            ? resolveChainGroupCode(allTasks, groupKey.replace(/^chain:/, ""))
            : null,
        count: taskIds.length,
      });
    }

    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const groupedTasksByKey = new Map<string, KanbanTask[]>();
    for (const [groupKey, taskIds] of groupedTaskIdsByKey.entries()) {
      const groupedTasks = taskIds
        .map((taskId) => tasksById.get(taskId))
        .filter((task): task is KanbanTask => Boolean(task));
      groupedTasksByKey.set(groupKey, groupedTasks);
    }

    const consumedTaskIds = new Set<string>();
    const blocks: TaskRenderBlock[] = [];
    for (const task of tasks) {
      if (consumedTaskIds.has(task.id)) {
        continue;
      }
      const groupRef = taskGroupByTaskId.get(task.id);
      const groupMeta = groupRef ? groupMetaByKey.get(groupRef.key) : undefined;
      if (!groupMeta) {
        consumedTaskIds.add(task.id);
        blocks.push({ type: "single", task });
        continue;
      }

      const groupTasks = (groupedTasksByKey.get(groupMeta.key) ?? []).slice();
      if (groupMeta.kind === "chain") {
        groupTasks.sort((a, b) => {
          const positionDiff =
            chainPositionOfTask(allTasks, a.id) - chainPositionOfTask(allTasks, b.id);
          if (positionDiff !== 0) {
            return positionDiff;
          }
          return a.sortOrder - b.sortOrder;
        });
      } else {
        groupTasks.sort((a, b) => a.sortOrder - b.sortOrder);
      }
      for (const groupedTask of groupTasks) {
        consumedTaskIds.add(groupedTask.id);
      }
      blocks.push({ type: "group", meta: groupMeta, tasks: groupTasks });
    }
    return blocks;
  }, [tasks, allTasks]);

  return (
    <div className="kanban-column">
      <div className="kanban-column-header">
        <div className="kanban-column-header-left">
          <span
            className="kanban-column-dot"
            style={{ backgroundColor: column.color }}
          />
          <span className="kanban-column-name">{t(column.labelKey)}</span>
          {tasks.length > 0 && (
            <span className="kanban-column-count">{tasks.length}</span>
          )}
        </div>
        <button
          className="kanban-icon-btn"
          onClick={onAddTask}
          aria-label={t("kanban.board.addTask")}
        >
          <Plus size={16} />
        </button>
      </div>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            className={`kanban-column-body${snapshot.isDraggingOver ? " is-dragging-over" : ""}`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {(() => {
              let draggableIndex = 0;
              return renderBlocks.map((block) => {
                if (block.type === "single") {
                  const task = block.task;
                  const chainGroupId = resolveTaskChainGroupId(allTasks, task);
                  const chainGroupCode =
                    chainGroupId ? resolveChainGroupCode(allTasks, chainGroupId) : null;
                  const chainOrderIndex = chainGroupId
                    ? chainPositionOfTask(allTasks, task.id)
                    : null;
                  const card = (
                    <KanbanCard
                      task={task}
                      index={draggableIndex}
                      chainGroupCode={chainGroupCode}
                      chainOrderIndex={chainOrderIndex}
                      isSelected={task.id === selectedTaskId}
                      isProcessing={taskProcessingMap[task.id]?.isProcessing ?? false}
                      processingStartedAt={taskProcessingMap[task.id]?.startedAt ?? null}
                      onSelect={() => onSelectTask(task)}
                      onDelete={() => onDeleteTask(task.id)}
                      onToggleSchedulePaused={() => onToggleSchedulePausedTask(task)}
                      onCancelOrBlock={() => onCancelOrBlockTask(task)}
                      onEdit={onEditTask ? () => onEditTask(task) : undefined}
                    />
                  );
                  draggableIndex += 1;
                  return <Fragment key={task.id}>{card}</Fragment>;
                }

                const { meta, tasks: groupedTasks } = block;
                const defaultCollapsed = column.id === "testing" || column.id === "done";
                const isCollapsed = collapsedGroups[meta.key] ?? defaultCollapsed;
                const groupLabel =
                  meta.kind === "recurring"
                    ? t("kanban.task.group.recurring")
                    : t("kanban.task.group.chain");

                return (
                  <div
                    key={meta.key}
                    className={`kanban-task-group-panel${meta.kind === "chain" ? " is-chain" : " is-recurring"}`}
                  >
                    <button
                      type="button"
                      className="kanban-task-group-header"
                      onClick={() =>
                        setCollapsedGroups((prev) => ({
                          ...prev,
                          [meta.key]: !(prev[meta.key] ?? defaultCollapsed),
                        }))
                      }
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      <span className="kanban-task-group-title">{groupLabel}</span>
                      {meta.kind === "chain" && meta.groupCode && (
                        <span className="kanban-task-group-code">#{meta.groupCode}</span>
                      )}
                      <span className="kanban-task-group-count">
                        {t("kanban.task.group.count", { count: meta.count })}
                      </span>
                    </button>
                    {!isCollapsed && groupedTasks.map((task) => {
                      const chainOrderIndex =
                        meta.kind === "chain" ? chainPositionOfTask(allTasks, task.id) : null;
                      const card = (
                        <KanbanCard
                          key={task.id}
                          task={task}
                          index={draggableIndex}
                          chainGroupCode={meta.groupCode}
                          chainOrderIndex={chainOrderIndex}
                          isSelected={task.id === selectedTaskId}
                          isProcessing={taskProcessingMap[task.id]?.isProcessing ?? false}
                          processingStartedAt={taskProcessingMap[task.id]?.startedAt ?? null}
                          onSelect={() => onSelectTask(task)}
                          onDelete={() => onDeleteTask(task.id)}
                          onToggleSchedulePaused={() => onToggleSchedulePausedTask(task)}
                          onCancelOrBlock={() => onCancelOrBlockTask(task)}
                          onEdit={onEditTask ? () => onEditTask(task) : undefined}
                        />
                      );
                      draggableIndex += 1;
                      return card;
                    })}
                  </div>
                );
              });
            })()}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
