// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { writeClientStoreData, writeClientStoreValue } from "../../../services/clientStorage";
import {
  loadSidebarSnapshot,
  saveSidebarSnapshotThreads,
  saveSidebarSnapshotWorkspaces,
} from "./sidebarSnapshot";

describe("sidebarSnapshot", () => {
  beforeEach(() => {
    writeClientStoreData("threads", {});
  });

  it("loads a valid sidebar snapshot", () => {
    writeClientStoreValue("threads", "sidebarSnapshot", {
      version: 1,
      updatedAt: 123,
      workspaces: [
        {
          id: "ws-1",
          name: "repo",
          path: "/tmp/repo",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ],
      threadsByWorkspace: {
        "ws-1": [{ id: "t-1", name: "Chat", updatedAt: 123 }],
      },
    });

    expect(loadSidebarSnapshot()).toEqual({
      version: 1,
      updatedAt: 123,
      workspaces: [
        {
          id: "ws-1",
          name: "repo",
          path: "/tmp/repo",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ],
      threadsByWorkspace: {
        "ws-1": [{ id: "t-1", name: "Chat", updatedAt: 123 }],
      },
    });
  });

  it("rejects malformed sidebar snapshots", () => {
    writeClientStoreValue("threads", "sidebarSnapshot", {
      version: 1,
      bad: true,
    });

    expect(loadSidebarSnapshot()).toBeNull();
  });

  it("merges workspace and thread writes into one snapshot", () => {
    saveSidebarSnapshotWorkspaces([
      {
        id: "ws-1",
        name: "repo",
        path: "/tmp/repo",
        connected: true,
        settings: { sidebarCollapsed: false },
      },
    ]);

    saveSidebarSnapshotThreads("ws-1", [
      { id: "thread-1", name: "Cached chat", updatedAt: 100 },
    ]);

    expect(loadSidebarSnapshot()).toEqual({
      version: 1,
      updatedAt: expect.any(Number),
      workspaces: [
        {
          id: "ws-1",
          name: "repo",
          path: "/tmp/repo",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ],
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Cached chat", updatedAt: 100 }],
      },
    });
  });

  it("keeps the last healthy snapshot when degraded threads are provided", () => {
    saveSidebarSnapshotThreads("ws-1", [
      { id: "thread-1", name: "Healthy chat", updatedAt: 100 },
    ]);

    saveSidebarSnapshotThreads("ws-1", [
      {
        id: "thread-1",
        name: "Recovered chat",
        updatedAt: 120,
        isDegraded: true,
        partialSource: "thread-list-live-timeout",
        degradedReason: "last-good-fallback",
      },
    ]);

    expect(loadSidebarSnapshot()?.threadsByWorkspace["ws-1"]).toEqual([
      { id: "thread-1", name: "Healthy chat", updatedAt: 100 },
    ]);
  });
});
