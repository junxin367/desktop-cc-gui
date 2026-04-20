// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getClientStoreSync, writeClientStoreData } from "../../../services/clientStorage";
import { useDebugLog } from "./useDebugLog";

describe("useDebugLog", () => {
  beforeEach(() => {
    writeClientStoreData("app", {});
  });

  it("mirrors thread continuity diagnostics into the thread session log store", () => {
    const { result } = renderHook(() => useDebugLog());

    act(() => {
      result.current.addDebugEntry({
        id: "entry-1",
        timestamp: 123,
        source: "client",
        label: "thread/list fallback",
        payload: {
          workspaceId: "ws-1",
          action: "thread-list-fallback",
          recoveryState: "degraded",
        },
      });
    });

    expect(getClientStoreSync("app", "diagnostics.threadSessionLog")).toEqual([
      {
        timestamp: 123,
        source: "client",
        label: "thread/list fallback",
        payload: {
          workspaceId: "ws-1",
          action: "thread-list-fallback",
          recoveryState: "degraded",
        },
      },
    ]);
  });
});
