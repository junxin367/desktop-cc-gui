import type { ConversationItem, QueuedMessage } from "../../../types";
import {
  resolveThreadStabilityDiagnostic,
  type RuntimeRecoveryHintReason,
} from "../../threads/utils/stabilityDiagnostics";

export type RuntimeReconnectHint = {
  reason: RuntimeRecoveryHintReason;
  rawMessage: string;
};

export function resolveRuntimeReconnectHint(text: string): RuntimeReconnectHint | null {
  const diagnostic = resolveThreadStabilityDiagnostic(text);
  if (!diagnostic?.reconnectReason) {
    return null;
  }
  return {
    reason: diagnostic.reconnectReason,
    rawMessage: diagnostic.rawMessage,
  };
}

export function normalizeRuntimeReconnectErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function resolveAssistantRuntimeReconnectHint(
  item: Extract<ConversationItem, { kind: "message" }>,
  hasAgentTaskNotification: boolean,
) {
  if (hasAgentTaskNotification || item.role !== "assistant") {
    return null;
  }
  return resolveRuntimeReconnectHint(item.text);
}

export function resolveRetryMessageForReconnectItem(
  items: ConversationItem[],
  reconnectItemId: string | null,
): Pick<QueuedMessage, "text" | "images"> | null {
  if (!reconnectItemId) {
    return null;
  }
  const reconnectIndex = items.findIndex((item) => item.id === reconnectItemId);
  if (reconnectIndex <= 0) {
    return null;
  }
  for (let index = reconnectIndex - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind !== "message" || item.role !== "user") {
      continue;
    }
    return {
      text: item.text,
      images: item.images,
    };
  }
  return null;
}
