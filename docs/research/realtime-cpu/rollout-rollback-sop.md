# Realtime CPU Optimization Rollout and Rollback SOP

## Scope

This SOP covers client-side realtime conversation CPU optimizations for:

- `mossx.perf.realtimeBatching`
- `mossx.perf.reducerNoopGuard`
- `mossx.perf.incrementalDerivation`
- `mossx.perf.debugLightPath`

No protocol/schema migration is involved. Rollback does not require data migration.

## Compatibility and Stability Hard Gates

Before release:

1. Run boundary guard and parity tests:
   - `pnpm perf:realtime:boundary-guard`
   - `pnpm vitest run src/features/threads/contracts/realtimeHistoryParity.test.ts`
2. Generate replay reports:
   - `pnpm perf:realtime:report`
3. Confirm report gates:
   - 5-minute: CPU drop >= 30%, peak frame-load proxy drop >= 25%.
   - 60-minute: semantic hash parity, zero integrity failures, no stuck processing.

## Rollout Plan

### Stage 0: Baseline Validation

- Keep all realtime perf flags disabled.
- Record baseline report from `docs/research/realtime-cpu/baseline-report.md`.

### Stage 1: Enable Batching and No-Op Guard

- Enable:
  - `mossx.perf.realtimeBatching=1`
  - `mossx.perf.reducerNoopGuard=1`
- Keep incremental derivation and debug light path unchanged.
- Validate:
  - no event loss
  - no lifecycle stuck processing
  - no duplicate rows in activity/radar.

### Stage 2: Enable Incremental Derivation

- Enable `mossx.perf.incrementalDerivation=1`.
- Validate:
  - unchanged threads keep reference stability where expected
  - activity/radar changed-thread refresh remains duplicate-free.

### Stage 3: Enable Debug Light Path (Default)

- Enable `mossx.perf.debugLightPath=1`.
- Keep `mossx.debug.threadSessionMirror=0` by default.
- Validate debug critical events still present (`error`, lifecycle boundaries, warnings).

## Monitoring Checklist

- CPU proxy from replay report:
  - `metrics.cpuTimeMs`
  - `metrics.totalActions`
  - `metrics.peakActionsPerFrame`
- Integrity:
  - `missingAgentMessages`
  - `missingToolOutputs`
  - `stuckProcessingThreads`
- Semantic equivalence:
  - baseline and optimized semantic hash match.

## Layered Rollback Procedure

If regression appears, rollback in strict order:

1. Disable batching:
   - `mossx.perf.realtimeBatching=0`
2. Disable incremental derivation:
   - `mossx.perf.incrementalDerivation=0`
3. Disable reducer no-op guard:
   - `mossx.perf.reducerNoopGuard=0`
4. Disable debug light path only if debug payload completeness is the issue:
   - `mossx.perf.debugLightPath=0`

After each step:

- replay boundary guard
- verify no stuck processing
- verify message continuity.

## Incident Escalation Triggers

- semantic hash mismatch against baseline replay
- any non-empty `missingAgentMessages` / `missingToolOutputs`
- `stuckProcessingThreads` not empty
- peak frame-load proxy regresses above baseline.

