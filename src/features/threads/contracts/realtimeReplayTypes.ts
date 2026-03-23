export type ReplayProfile = "baseline" | "optimized";

type ReplayEventBase = {
  id: string;
  atMs: number;
  workspaceId: string;
  threadId: string;
};

export type AgentDeltaReplayEvent = ReplayEventBase & {
  kind: "agentDelta";
  itemId: string;
  delta: string;
};

export type ReasoningSummaryDeltaReplayEvent = ReplayEventBase & {
  kind: "reasoningSummaryDelta";
  itemId: string;
  delta: string;
};

export type ReasoningContentDeltaReplayEvent = ReplayEventBase & {
  kind: "reasoningContentDelta";
  itemId: string;
  delta: string;
};

export type ToolStartedReplayEvent = ReplayEventBase & {
  kind: "toolStarted";
  itemId: string;
  command: string;
};

export type ToolOutputDeltaReplayEvent = ReplayEventBase & {
  kind: "toolOutputDelta";
  itemId: string;
  delta: string;
};

export type AgentCompletedReplayEvent = ReplayEventBase & {
  kind: "agentCompleted";
  itemId: string;
  text: string;
};

export type RealtimeReplayEvent =
  | AgentDeltaReplayEvent
  | ReasoningSummaryDeltaReplayEvent
  | ReasoningContentDeltaReplayEvent
  | ToolStartedReplayEvent
  | ToolOutputDeltaReplayEvent
  | AgentCompletedReplayEvent;

