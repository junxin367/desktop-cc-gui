export type ThreadDebugRecoveryState =
  | "healthy"
  | "recovering"
  | "degraded"
  | "quarantined";

type ThreadDebugCorrelationOptions = {
  workspaceId?: string | null;
  threadId?: string | null;
  action: string;
  engine?: string | null;
  diagnosticCategory?: string | null;
  recoveryState?: ThreadDebugRecoveryState | null;
};

function inferEngineFromThreadId(threadId: string | null | undefined): string | null {
  const normalized = threadId?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("claude:") || normalized.startsWith("claude-pending-")) {
    return "claude";
  }
  if (normalized.startsWith("gemini:") || normalized.startsWith("gemini-pending-")) {
    return "gemini";
  }
  if (normalized.startsWith("opencode:") || normalized.startsWith("opencode-pending-")) {
    return "opencode";
  }
  return "codex";
}

function inferRecoveryState(
  diagnosticCategory: string | null | undefined,
  fallback: ThreadDebugRecoveryState | null | undefined,
): ThreadDebugRecoveryState {
  if (fallback) {
    return fallback;
  }
  if (diagnosticCategory === "runtime_quarantined") {
    return "quarantined";
  }
  if (diagnosticCategory) {
    return "recovering";
  }
  return "healthy";
}

export function buildThreadDebugCorrelation(
  options: ThreadDebugCorrelationOptions,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  const workspaceId = options.workspaceId?.trim() ?? "";
  const threadId = options.threadId?.trim() ?? "";
  const diagnosticCategory = options.diagnosticCategory?.trim() ?? "";
  return {
    workspaceId: workspaceId || null,
    threadId: threadId || null,
    engine: options.engine ?? inferEngineFromThreadId(threadId) ?? null,
    action: options.action,
    recoveryState: inferRecoveryState(
      diagnosticCategory || null,
      options.recoveryState ?? null,
    ),
    ...(diagnosticCategory ? { diagnosticCategory } : {}),
    ...payload,
  };
}
