import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { writeClientStoreValue, getClientStoreSync } from "../../services/clientStorage";
import { isMacPlatform } from "../../utils/platform";

export const DETACHED_FILE_EXPLORER_WINDOW_LABEL = "file-explorer";
export const DETACHED_FILE_EXPLORER_SESSION_EVENT = "detached-file-explorer:session";
export const DETACHED_FILE_EXPLORER_SESSION_STORAGE_KEY = "detachedFileExplorerSession";
const DETACHED_FILE_EXPLORER_CREATE_TIMEOUT_MS = 4_000;

export type DetachedFileExplorerSession = {
  workspaceId: string;
  workspacePath: string;
  workspaceName: string;
  gitRoot?: string | null;
  initialFilePath?: string | null;
  updatedAt: number;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDetachedFileExplorerSession(
  value: unknown,
): DetachedFileExplorerSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const workspaceId = normalizeString(candidate.workspaceId);
  const workspacePath = normalizeString(candidate.workspacePath);
  const workspaceName = normalizeString(candidate.workspaceName);
  const gitRoot = normalizeString(candidate.gitRoot);
  const initialFilePath = normalizeString(candidate.initialFilePath);
  const updatedAt =
    typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : Date.now();
  if (!workspaceId || !workspacePath || !workspaceName) {
    return null;
  }
  return {
    workspaceId,
    workspacePath,
    workspaceName,
    gitRoot: gitRoot || null,
    initialFilePath: initialFilePath || null,
    updatedAt,
  };
}

export function buildDetachedFileExplorerSession(input: {
  workspaceId: string;
  workspacePath: string;
  workspaceName: string;
  gitRoot?: string | null;
  initialFilePath?: string | null;
}): DetachedFileExplorerSession {
  return {
    workspaceId: input.workspaceId.trim(),
    workspacePath: input.workspacePath.trim(),
    workspaceName: input.workspaceName.trim(),
    gitRoot: input.gitRoot?.trim() || null,
    initialFilePath: input.initialFilePath?.trim() || null,
    updatedAt: Date.now(),
  };
}

export function readDetachedFileExplorerSessionSnapshot(): DetachedFileExplorerSession | null {
  return normalizeDetachedFileExplorerSession(
    getClientStoreSync("app", DETACHED_FILE_EXPLORER_SESSION_STORAGE_KEY),
  );
}

export function writeDetachedFileExplorerSessionSnapshot(
  session: DetachedFileExplorerSession,
): void {
  writeClientStoreValue(
    "app",
    DETACHED_FILE_EXPLORER_SESSION_STORAGE_KEY,
    session,
    { immediate: true },
  );
}

export function buildDetachedFileExplorerWindowTitle(
  session: Pick<DetachedFileExplorerSession, "workspaceName">,
): string {
  return `${session.workspaceName} · File Explorer`;
}

function normalizeWindowErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return JSON.stringify(payload ?? "unknown error");
}

export async function hasDetachedFileExplorerWindow(): Promise<boolean> {
  const existing = await WebviewWindow.getByLabel(DETACHED_FILE_EXPLORER_WINDOW_LABEL);
  return existing !== null;
}

export async function openOrFocusDetachedFileExplorer(
  session: DetachedFileExplorerSession,
): Promise<"created" | "focused"> {
  writeDetachedFileExplorerSessionSnapshot(session);
  const existing = await WebviewWindow.getByLabel(DETACHED_FILE_EXPLORER_WINDOW_LABEL);
  if (existing) {
    await existing.show().catch(() => {});
    await existing.setFocus().catch(() => {});
    await existing.setTitle(buildDetachedFileExplorerWindowTitle(session)).catch(() => {});
    await emitTo(
      DETACHED_FILE_EXPLORER_WINDOW_LABEL,
      DETACHED_FILE_EXPLORER_SESSION_EVENT,
      session,
    ).catch(() => {});
    return "focused";
  }

  const rootUrl = new URL("/", window.location.href).toString();
  const detachedWindow = new WebviewWindow(DETACHED_FILE_EXPLORER_WINDOW_LABEL, {
    url: rootUrl,
    title: buildDetachedFileExplorerWindowTitle(session),
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    center: true,
    resizable: true,
    focus: true,
    ...(isMacPlatform()
      ? {
          titleBarStyle: "overlay",
          hiddenTitle: true,
          transparent: false,
        }
      : {}),
  });
  return await new Promise<"created">((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = globalThis.setTimeout(() => {
      settle(() => {
        reject(new Error("Timed out while opening detached file explorer"));
      });
    }, DETACHED_FILE_EXPLORER_CREATE_TIMEOUT_MS);

    detachedWindow.once("tauri://error", (event) => {
      const message = normalizeWindowErrorMessage(event.payload);
      console.error("[detached-file-explorer] create window failed", message);
      settle(() => {
        reject(new Error(message));
      });
    });
    detachedWindow.once("tauri://created", () => {
      void (async () => {
        await emitTo(
          DETACHED_FILE_EXPLORER_WINDOW_LABEL,
          DETACHED_FILE_EXPLORER_SESSION_EVENT,
          session,
        ).catch(() => {});
        await detachedWindow.setFocus().catch(() => {});
        settle(() => {
          resolve("created");
        });
      })();
    });
  });
}
