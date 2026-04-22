export type GlobalRuntimeNoticeSeverity = "info" | "warning" | "error";

export type GlobalRuntimeNoticeCategory =
  | "bootstrap"
  | "runtime"
  | "workspace"
  | "diagnostic"
  | "user-action-error";

export type GlobalRuntimeNoticeMessageParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type GlobalRuntimeNotice = {
  id: string;
  severity: GlobalRuntimeNoticeSeverity;
  category: GlobalRuntimeNoticeCategory;
  messageKey: string;
  messageParams?: GlobalRuntimeNoticeMessageParams;
  timestampMs: number;
  repeatCount: number;
  dedupeKey: string;
};

export type GlobalRuntimeNoticeInput = {
  severity: GlobalRuntimeNoticeSeverity;
  category: GlobalRuntimeNoticeCategory;
  messageKey: string;
  messageParams?: GlobalRuntimeNoticeMessageParams;
  timestampMs?: number;
  dedupeKey?: string;
};

type GlobalRuntimeNoticeListener = (
  notices: readonly GlobalRuntimeNotice[],
) => void;

export const GLOBAL_RUNTIME_NOTICE_BUFFER_LIMIT = 120;

const listeners = new Set<GlobalRuntimeNoticeListener>();
let notices: GlobalRuntimeNotice[] = [];
let nextNoticeId = 0;

function makeNoticeId(timestampMs: number) {
  nextNoticeId += 1;
  return `global-runtime-notice-${timestampMs}-${nextNoticeId}`;
}

function normalizeMessageParams(
  value: GlobalRuntimeNoticeMessageParams | undefined,
): GlobalRuntimeNoticeMessageParams | undefined {
  if (!value) {
    return undefined;
  }
  const normalizedEntries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (!normalizedEntries.length) {
    return undefined;
  }
  return Object.fromEntries(normalizedEntries);
}

function serializeMessageParams(value: GlobalRuntimeNoticeMessageParams | undefined) {
  const normalized = normalizeMessageParams(value);
  if (!normalized) {
    return "";
  }
  return Object.entries(normalized)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${key}:${String(item)}`)
    .join("|");
}

function resolveDedupeKey(input: GlobalRuntimeNoticeInput) {
  if (typeof input.dedupeKey === "string" && input.dedupeKey.trim().length > 0) {
    return input.dedupeKey.trim();
  }
  return [
    input.category,
    input.severity,
    input.messageKey,
    serializeMessageParams(input.messageParams),
  ].join("|");
}

function cloneSnapshot() {
  return notices.map((notice) => ({
    ...notice,
    messageParams: notice.messageParams ? { ...notice.messageParams } : undefined,
  }));
}

function notifyListeners() {
  const snapshot = cloneSnapshot();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("[globalRuntimeNotices] listener failed", error);
    }
  }
}

export function getGlobalRuntimeNoticesSnapshot(): readonly GlobalRuntimeNotice[] {
  return cloneSnapshot();
}

export function pushGlobalRuntimeNotice(
  input: GlobalRuntimeNoticeInput,
): GlobalRuntimeNotice {
  const timestampMs =
    typeof input.timestampMs === "number" && Number.isFinite(input.timestampMs)
      ? Math.trunc(input.timestampMs)
      : Date.now();
  const messageParams = normalizeMessageParams(input.messageParams);
  const dedupeKey = resolveDedupeKey(input);
  const lastNotice = notices[notices.length - 1];

  if (lastNotice && lastNotice.dedupeKey === dedupeKey) {
    const mergedNotice: GlobalRuntimeNotice = {
      ...lastNotice,
      timestampMs,
      repeatCount: lastNotice.repeatCount + 1,
    };
    notices = [...notices.slice(0, -1), mergedNotice];
    notifyListeners();
    return mergedNotice;
  }

  const notice: GlobalRuntimeNotice = {
    id: makeNoticeId(timestampMs),
    severity: input.severity,
    category: input.category,
    messageKey: input.messageKey,
    messageParams,
    timestampMs,
    repeatCount: 1,
    dedupeKey,
  };

  notices = [...notices, notice].slice(-GLOBAL_RUNTIME_NOTICE_BUFFER_LIMIT);
  notifyListeners();
  return notice;
}

export function clearGlobalRuntimeNotices() {
  if (notices.length === 0) {
    return;
  }
  notices = [];
  notifyListeners();
}

export function subscribeGlobalRuntimeNotices(
  listener: GlobalRuntimeNoticeListener,
) {
  listeners.add(listener);
  listener(cloneSnapshot());
  return () => {
    listeners.delete(listener);
  };
}
