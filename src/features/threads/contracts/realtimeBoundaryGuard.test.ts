import { describe, expect, it } from "vitest";
import {
  buildThreeThreadReplayEventsForMinutes,
  REALTIME_REPLAY_BATCH_WINDOW_MS,
} from "./realtimeReplayFixture";
import { runReplayProfile } from "./realtimeReplayHarness";

describe("realtime boundary guard", () => {
  it("keeps ordering, terminal lifecycle, and payload completeness equivalent", async () => {
    const events = buildThreeThreadReplayEventsForMinutes(5);
    const baseline = await runReplayProfile({
      events,
      profile: "baseline",
      batchWindowMs: REALTIME_REPLAY_BATCH_WINDOW_MS,
    });
    const optimized = await runReplayProfile({
      events,
      profile: "optimized",
      batchWindowMs: REALTIME_REPLAY_BATCH_WINDOW_MS,
    });

    expect(optimized.semanticsHash).toBe(baseline.semanticsHash);
    expect(optimized.semanticsSnapshot).toEqual(baseline.semanticsSnapshot);
    expect(baseline.integrity).toEqual({
      missingAgentMessages: [],
      missingReasoningItems: [],
      missingToolOutputs: [],
      stuckProcessingThreads: [],
    });
    expect(optimized.integrity).toEqual({
      missingAgentMessages: [],
      missingReasoningItems: [],
      missingToolOutputs: [],
      stuckProcessingThreads: [],
    });
  });
});

