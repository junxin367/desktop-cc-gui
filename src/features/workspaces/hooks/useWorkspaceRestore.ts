import { useEffect, useRef } from "react";
import type { WorkspaceInfo } from "../../../types";

type WorkspaceRestoreOptions = {
  workspaces: WorkspaceInfo[];
  hasLoaded: boolean;
  activeWorkspaceId: string | null;
  restoreThreadsOnlyOnLaunch: boolean;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  listThreadsForWorkspace: (
    workspace: WorkspaceInfo,
    options?: { preserveState?: boolean; includeOpenCodeSessions?: boolean },
  ) => Promise<void>;
};

export function useWorkspaceRestore({
  workspaces,
  hasLoaded,
  activeWorkspaceId,
  restoreThreadsOnlyOnLaunch,
  connectWorkspace,
  listThreadsForWorkspace,
}: WorkspaceRestoreOptions) {
  const restoredWorkspaces = useRef(new Set<string>());
  const restoringWorkspaces = useRef(new Set<string>());

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }
    const pending = workspaces.filter((workspace) => {
      if (restoredWorkspaces.current.has(workspace.id)) {
        return false;
      }
      if (restoringWorkspaces.current.has(workspace.id)) {
        return false;
      }
      if (workspace.id === activeWorkspaceId) {
        return true;
      }
      return !workspace.settings.sidebarCollapsed;
    });
    if (pending.length === 0) {
      return;
    }
    pending.forEach((workspace) => {
      restoringWorkspaces.current.add(workspace.id);
    });
    const active = pending.find((w) => w.id === activeWorkspaceId);
    const rest = pending.filter((w) => w.id !== activeWorkspaceId);
    let cancelled = false;
    const restoreOne = async (workspace: WorkspaceInfo) => {
      if (cancelled) {
        return;
      }
      try {
        if (!restoreThreadsOnlyOnLaunch && !workspace.connected) {
          await connectWorkspace(workspace);
        }
        await listThreadsForWorkspace(workspace, {
          includeOpenCodeSessions: false,
        });
        // A rerender may cancel the current effect while the in-flight restore
        // still succeeds. Keep the success marker so we do not restart the same
        // workspace restore loop on every workspace refresh.
        restoredWorkspaces.current.add(workspace.id);
      } finally {
        restoringWorkspaces.current.delete(workspace.id);
      }
    };
    void (async () => {
      if (active) {
        await restoreOne(active).catch(() => {
          // Silent: connection errors show in debug panel.
        });
      }
      await Promise.allSettled(
        rest.map((workspace) =>
          restoreOne(workspace).catch(() => {
            // Silent: connection errors show in debug panel.
          }),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspaceId,
    connectWorkspace,
    hasLoaded,
    listThreadsForWorkspace,
    restoreThreadsOnlyOnLaunch,
    workspaces,
  ]);
}
