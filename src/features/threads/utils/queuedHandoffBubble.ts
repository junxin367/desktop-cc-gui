import type {
  ConversationItem,
  MessageSendOptions,
  QueuedMessage,
} from "../../../types";

const OPTIMISTIC_USER_ITEM_PREFIX = "optimistic-user-";
const USER_INPUT_BLOCK_MARKER_REGEX = /\[User Input\]\s*/gi;
const PROJECT_MEMORY_BLOCK_REGEX = /^<project-memory>[\s\S]*?<\/project-memory>\s*/i;
const MODE_FALLBACK_PREFIX_REGEX =
  /^(?:collaboration mode:\s*code\.|execution policy \(default mode\):|execution policy \(plan mode\):)/i;
const MODE_FALLBACK_MARKER_REGEX = /User request\s*:\s*/i;
const AGENT_PROMPT_HEADER = "## Agent Role and Instructions";
const AGENT_PROMPT_NAME_PREFIX_REGEX = /^Agent Name:\s*\S+/i;
const AGENT_PROMPT_ICON_PREFIX_REGEX = /^Agent Icon:\s*\S+/i;
const SHARED_SESSION_SYNC_PREFIX_REGEX =
  /^Shared session context sync\.\s*Continue from these recent turns before answering the new request:\s*/i;
const SHARED_SESSION_CURRENT_REQUEST_MARKER_REGEX =
  /(?:\r?\n){1,2}Current user request:\s*(?:\r?\n)?/i;

type MessageConversationItem = Extract<ConversationItem, { kind: "message" }>;
type UserConversationMessage = MessageConversationItem & { role: "user" };

export type QueuedHandoffBubble = UserConversationMessage;

function stripInjectedProjectMemoryBlock(text: string): string {
  const match = PROJECT_MEMORY_BLOCK_REGEX.exec(text.trimStart());
  if (!match || match.index !== 0) {
    return text;
  }
  const stripped = text.replace(PROJECT_MEMORY_BLOCK_REGEX, "");
  return stripped.trim().length > 0 ? stripped : text;
}

function stripModeFallbackBlock(text: string): string {
  if (!MODE_FALLBACK_PREFIX_REGEX.test(text.trimStart())) {
    return text;
  }
  const marker = MODE_FALLBACK_MARKER_REGEX.exec(text);
  if (!marker || marker.index < 0) {
    return text;
  }
  const extractedRaw = text.slice(marker.index + marker[0].length);
  const extracted = extractedRaw.replace(/^\r?\n/, "").replace(/^ /, "");
  return extracted.trim().length > 0 ? extracted : text;
}

function stripSelectedAgentPromptBlock(text: string): string {
  const headerIndex = text.lastIndexOf(AGENT_PROMPT_HEADER);
  if (headerIndex < 0) {
    return text;
  }
  const prefix = text.slice(0, headerIndex);
  const suffix = text
    .slice(headerIndex + AGENT_PROMPT_HEADER.length)
    .replace(/^\s+/, "");
  if (!suffix) {
    return text;
  }
  const looksInjectedAgentBlock =
    AGENT_PROMPT_NAME_PREFIX_REGEX.test(suffix) ||
    AGENT_PROMPT_ICON_PREFIX_REGEX.test(suffix);
  if (!looksInjectedAgentBlock) {
    return text;
  }
  return prefix.replace(/\s+$/, "");
}

function stripSharedSessionContextSyncWrapper(text: string): string {
  if (!SHARED_SESSION_SYNC_PREFIX_REGEX.test(text.trimStart())) {
    return text;
  }
  const markerMatch = SHARED_SESSION_CURRENT_REQUEST_MARKER_REGEX.exec(text);
  if (!markerMatch || markerMatch.index < 0) {
    return text;
  }
  const extractedRaw = text.slice(markerMatch.index + markerMatch[0].length);
  const extracted = extractedRaw.replace(/^\r?\n/, "").replace(/^ /, "");
  return extracted.trim().length > 0 ? extracted : text;
}

function extractLatestUserInputTextPreserveFormatting(text: string): string {
  const userInputMatches = [...text.matchAll(USER_INPUT_BLOCK_MARKER_REGEX)];
  if (userInputMatches.length === 0) {
    return text;
  }
  const lastMatch = userInputMatches[userInputMatches.length - 1];
  if (!lastMatch) {
    return text;
  }
  const markerIndex = lastMatch.index ?? -1;
  if (markerIndex < 0) {
    return text;
  }
  return text.slice(markerIndex + lastMatch[0].length);
}

export function normalizeComparableUserText(text: string): string {
  const latestUserInput = extractLatestUserInputTextPreserveFormatting(text);
  const normalized = stripSharedSessionContextSyncWrapper(
    stripSelectedAgentPromptBlock(
      stripModeFallbackBlock(stripInjectedProjectMemoryBlock(latestUserInput)),
    ),
  );
  return normalized.replace(/\s+/g, " ").trim();
}

export function normalizeUserImages(images: string[] | undefined): string[] {
  return Array.isArray(images) ? images : [];
}

export function areSameUserImages(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((image, index) => image === right[index]);
}

export function isOptimisticUserMessageId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_USER_ITEM_PREFIX);
}

export function isUserConversationMessage(
  item: ConversationItem | undefined,
): item is UserConversationMessage {
  return item?.kind === "message" && item.role === "user";
}

export function doesConversationItemMatchUserBubble(
  item: ConversationItem,
  bubble: Pick<UserConversationMessage, "text" | "images">,
): boolean {
  if (!isUserConversationMessage(item)) {
    return false;
  }
  return (
    normalizeComparableUserText(item.text) === normalizeComparableUserText(bubble.text) &&
    areSameUserImages(
      normalizeUserImages(item.images),
      normalizeUserImages(bubble.images),
    )
  );
}

export function hasPendingOptimisticUserBubble(items: ConversationItem[]): boolean {
  return items.some(
    (item) => isUserConversationMessage(item) && isOptimisticUserMessageId(item.id),
  );
}

function normalizeSelectedAgentName(options: MessageSendOptions | undefined): string | undefined {
  const trimmed = options?.selectedAgent?.name?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSelectedAgentIcon(options: MessageSendOptions | undefined): string | undefined {
  const trimmed = options?.selectedAgent?.icon?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeCollaborationMode(
  options: MessageSendOptions | undefined,
): "plan" | "code" | undefined {
  const mode = options?.collaborationMode?.mode;
  return mode === "plan" || mode === "code" ? mode : undefined;
}

export function buildQueuedHandoffBubbleItem(
  item: QueuedMessage,
): QueuedHandoffBubble {
  const collaborationMode = normalizeCollaborationMode(item.sendOptions);
  const selectedAgentName = normalizeSelectedAgentName(item.sendOptions);
  const selectedAgentIcon = normalizeSelectedAgentIcon(item.sendOptions);
  return {
    id: `queued-handoff-${item.id}`,
    kind: "message",
    role: "user",
    text: item.text,
    images: item.images?.length ? item.images : undefined,
    ...(collaborationMode ? { collaborationMode } : {}),
    ...(selectedAgentName ? { selectedAgentName } : {}),
    ...(selectedAgentIcon ? { selectedAgentIcon } : {}),
  };
}

export function appendQueuedHandoffBubbleIfNeeded(
  items: ConversationItem[],
  bubble: QueuedHandoffBubble | null,
): ConversationItem[] {
  if (!bubble) {
    return items;
  }
  if (items.some((item) => doesConversationItemMatchUserBubble(item, bubble))) {
    return items;
  }
  return [...items, bubble];
}
