import { useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { ApprovalRequest, DebugEntry } from "../../../types";
import i18n from "../../../i18n";
import { normalizeCommandTokens } from "../../../utils/approvalRules";
import {
  rememberApprovalRule,
  respondToServerRequest,
} from "../../../services/tauri";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadApprovalsOptions = {
  approvals: ApprovalRequest[];
  dispatch: Dispatch<ThreadAction>;
  onDebug?: (entry: DebugEntry) => void;
};

function getApprovalTurnId(request: ApprovalRequest): string | null {
  const turnId = request.params?.turnId ?? request.params?.turn_id;
  return typeof turnId === "string" && turnId.trim() ? turnId.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getApprovalInputRecord(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const nestedInput = asRecord(params.input);
  return Object.keys(nestedInput).length > 0 ? nestedInput : params;
}

function getApprovalThreadId(request: ApprovalRequest): string | null {
  const threadId = request.params?.threadId ?? request.params?.thread_id;
  return typeof threadId === "string" && threadId.trim() ? threadId.trim() : null;
}

function getApprovalPath(params: Record<string, unknown>): string | null {
  for (const key of [
    "file_path",
    "filePath",
    "filepath",
    "path",
    "target_file",
    "targetFile",
    "filename",
    "file",
    "notebook_path",
    "notebookPath",
  ]) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function useThreadApprovals({
  approvals,
  dispatch,
  onDebug,
}: UseThreadApprovalsOptions) {
  const approvalAllowlistRef = useRef<Record<string, string[][]>>({});

  const markApprovalAsApplying = useCallback(
    (request: ApprovalRequest) => {
      const threadId = getApprovalThreadId(request);
      if (!threadId || !request.method.includes("fileChange")) {
        return;
      }
      dispatch({
        type: "markProcessing",
        threadId,
        isProcessing: true,
        timestamp: Date.now(),
      });
      dispatch({
        type: "setActiveTurnId",
        threadId,
        turnId: getApprovalTurnId(request),
      });
      const params = request.params ?? {};
      const input = getApprovalInputRecord(params);
      const filePath = getApprovalPath(input) ?? getApprovalPath(params);
      dispatch({
        type: "upsertItem",
        workspaceId: request.workspace_id,
        threadId,
        item: {
          id: String(request.request_id),
          kind: "tool",
          toolType: "fileChange",
          title: i18n.t("approval.applyingApprovedFileChange"),
          detail: JSON.stringify(input),
          status: "running",
          output: i18n.t("approval.resumingAfterApproval"),
          changes: filePath ? [{ path: filePath }] : undefined,
        },
      });
    },
    [dispatch],
  );

  const rememberApprovalPrefix = useCallback((workspaceId: string, command: string[]) => {
    const normalized = normalizeCommandTokens(command);
    if (!normalized.length) {
      return;
    }
    const allowlist = approvalAllowlistRef.current[workspaceId] ?? [];
    const exists = allowlist.some(
      (entry) =>
        entry.length === normalized.length &&
        entry.every((token, index) => token === normalized[index]),
    );
    if (!exists) {
      approvalAllowlistRef.current = {
        ...approvalAllowlistRef.current,
        [workspaceId]: [...allowlist, normalized],
      };
    }
  }, []);

  const handleApprovalDecision = useCallback(
    async (request: ApprovalRequest, decision: "accept" | "decline") => {
      if (decision === "accept") {
        markApprovalAsApplying(request);
      }
      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        decision,
      );
      dispatch({
        type: "removeApproval",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
        approval: request,
      });
    },
    [dispatch, markApprovalAsApplying],
  );

  const handleApprovalBatchAccept = useCallback(
    async (request: ApprovalRequest) => {
      const turnId = getApprovalTurnId(request);
      if (!turnId) {
        await handleApprovalDecision(request, "accept");
        return;
      }

      const batch = approvals.filter(
        (entry) =>
          entry.workspace_id === request.workspace_id &&
          getApprovalTurnId(entry) === turnId,
      );

      if (!batch.length) {
        await handleApprovalDecision(request, "accept");
        return;
      }

      for (const approval of batch) {
        markApprovalAsApplying(approval);
        await respondToServerRequest(
          approval.workspace_id,
          approval.request_id,
          "accept",
        );
        dispatch({
          type: "removeApproval",
          requestId: approval.request_id,
          workspaceId: approval.workspace_id,
          approval,
        });
      }
    },
    [approvals, dispatch, handleApprovalDecision, markApprovalAsApplying],
  );

  const handleApprovalRemember = useCallback(
    async (request: ApprovalRequest, command: string[]) => {
      try {
        await rememberApprovalRule(request.workspace_id, command);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-approval-rule-error`,
          timestamp: Date.now(),
          source: "error",
          label: "approval rule error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }

      rememberApprovalPrefix(request.workspace_id, command);

      markApprovalAsApplying(request);

      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        "accept",
      );
      dispatch({
        type: "removeApproval",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
        approval: request,
      });
    },
    [dispatch, markApprovalAsApplying, onDebug, rememberApprovalPrefix],
  );

  return {
    approvalAllowlistRef,
    handleApprovalDecision,
    handleApprovalBatchAccept,
    handleApprovalRemember,
  };
}
