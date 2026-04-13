import {
  getClientStoreSync,
  isPreloaded,
  writeClientStoreValue,
} from "./clientStorage";

export type RendererDiagnosticEntry = {
  timestamp: number;
  label: string;
  payload: Record<string, unknown>;
};

const RENDERER_DIAGNOSTICS_KEY = "diagnostics.rendererLifecycleLog";
const MAX_RENDERER_DIAGNOSTICS = 200;

let installed = false;
let bufferedEntries: RendererDiagnosticEntry[] = [];

function trimDiagnostics(entries: RendererDiagnosticEntry[]) {
  if (entries.length <= MAX_RENDERER_DIAGNOSTICS) {
    return entries;
  }
  return entries.slice(entries.length - MAX_RENDERER_DIAGNOSTICS);
}

function formatUnknown(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectWindowSnapshot(extra: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return extra;
  }
  return {
    visibilityState: document.visibilityState,
    readyState: document.readyState,
    hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : null,
    href: window.location.href,
    ...extra,
  };
}

function persistDiagnostics(entries: RendererDiagnosticEntry[]) {
  writeClientStoreValue("app", RENDERER_DIAGNOSTICS_KEY, entries, { immediate: true });
}

function readPersistedDiagnostics() {
  const stored = getClientStoreSync<RendererDiagnosticEntry[] | unknown>(
    "app",
    RENDERER_DIAGNOSTICS_KEY,
  );
  return Array.isArray(stored) ? stored : [];
}

export function appendRendererDiagnostic(
  label: string,
  payload: Record<string, unknown> = {},
) {
  const entry: RendererDiagnosticEntry = {
    timestamp: Date.now(),
    label,
    payload,
  };

  if (!isPreloaded()) {
    bufferedEntries = trimDiagnostics([...bufferedEntries, entry]);
    return;
  }

  const existing = readPersistedDiagnostics();
  const nextEntries = trimDiagnostics([...existing, ...bufferedEntries, entry]);
  bufferedEntries = [];
  persistDiagnostics(nextEntries);
}

export function flushRendererDiagnosticsBuffer() {
  if (!isPreloaded() || bufferedEntries.length === 0) {
    return;
  }
  const existing = readPersistedDiagnostics();
  const nextEntries = trimDiagnostics([...existing, ...bufferedEntries]);
  bufferedEntries = [];
  persistDiagnostics(nextEntries);
}

export function installRendererLifecycleDiagnostics() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  installed = true;

  appendRendererDiagnostic("renderer/install", collectWindowSnapshot());

  window.addEventListener("focus", () => {
    appendRendererDiagnostic("window/focus", collectWindowSnapshot());
  });

  window.addEventListener("blur", () => {
    appendRendererDiagnostic("window/blur", collectWindowSnapshot());
  });

  document.addEventListener("visibilitychange", () => {
    appendRendererDiagnostic(
      "document/visibilitychange",
      collectWindowSnapshot({
        hidden: document.hidden,
      }),
    );
  });

  window.addEventListener("pageshow", (event) => {
    appendRendererDiagnostic(
      "window/pageshow",
      collectWindowSnapshot({
        persisted: event.persisted,
      }),
    );
  });

  window.addEventListener("pagehide", (event) => {
    appendRendererDiagnostic(
      "window/pagehide",
      collectWindowSnapshot({
        persisted: event.persisted,
      }),
    );
  });

  window.addEventListener("error", (event) => {
    appendRendererDiagnostic(
      "window/error",
      collectWindowSnapshot({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: formatUnknown(event.error),
      }),
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    appendRendererDiagnostic(
      "window/unhandledrejection",
      collectWindowSnapshot({
        reason: formatUnknown(event.reason),
      }),
    );
  });
}
