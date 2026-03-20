import type { ConversationItem } from "../../../types";
import type { KanbanTaskResultSnapshot } from "../types";

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 800);
}

function extractReadableText(item: ConversationItem): string | null {
  if (item.kind === "message" && item.role === "assistant" && item.text.trim()) {
    return item.text;
  }
  if (item.kind === "tool") {
    if (item.output?.trim()) {
      return item.output;
    }
    if (item.detail?.trim()) {
      return item.detail;
    }
  }
  if (item.kind === "review" && item.text.trim()) {
    return item.text;
  }
  return null;
}

export function extractKanbanResultSnapshot(
  sourceThreadId: string | null | undefined,
  items: ConversationItem[] | undefined,
  nowTs = Date.now(),
): KanbanTaskResultSnapshot | null {
  if (!sourceThreadId || !items?.length) {
    return null;
  }

  let sourceMessageId: string | null = null;
  let summary: string | null = null;
  const artifactPathSet = new Set<string>();

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!summary) {
      const text = extractReadableText(item);
      if (text) {
        summary = normalizeSummaryText(text);
        sourceMessageId = item.id;
      }
    }
    if (item.kind === "tool" && Array.isArray(item.changes)) {
      for (const change of item.changes) {
        if (change?.path) {
          artifactPathSet.add(change.path);
        }
      }
    }
    if (summary && artifactPathSet.size >= 6) {
      break;
    }
  }

  if (!summary) {
    return null;
  }

  return {
    sourceThreadId,
    sourceMessageId,
    summary,
    artifactPaths: Array.from(artifactPathSet),
    capturedAt: nowTs,
  };
}

export function buildChainedPromptPrefix(snapshot: KanbanTaskResultSnapshot): string {
  const lines = [
    "[Upstream result snapshot]",
    `summary: ${snapshot.summary}`,
  ];
  if (snapshot.artifactPaths.length > 0) {
    lines.push(`artifacts: ${snapshot.artifactPaths.join(", ")}`);
  }
  return lines.join("\n");
}
