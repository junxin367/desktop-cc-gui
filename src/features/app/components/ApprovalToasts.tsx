import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ApprovalRequest, WorkspaceInfo } from "../../../types";
import { getApprovalCommandInfo } from "../../../utils/approvalRules";

type ApprovalToastsProps = {
  approvals: ApprovalRequest[];
  workspaces: WorkspaceInfo[];
  onDecision: (request: ApprovalRequest, decision: "accept" | "decline") => void;
  onApproveBatch?: (request: ApprovalRequest) => void;
  onRemember?: (request: ApprovalRequest, command: string[]) => void;
};

const HIDDEN_APPROVAL_PARAM_KEYS = new Set([
  "threadId",
  "thread_id",
  "turnId",
  "turn_id",
  "itemId",
  "item_id",
  "input",
  "message",
]);

function getToolLabel(method: string): string {
  if (method.includes("fileChange")) {
    return "File changes";
  }
  if (method.includes("commandExecution")) {
    return "Command execution";
  }
  return "Approval";
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

function getApprovalMessage(params: Record<string, unknown>): string | null {
  const raw = typeof params.message === "string" ? params.message.trim() : "";
  if (!raw) {
    return null;
  }
  if (raw.includes("acknowledges the blocked request")) {
    return "Claude 需要你的授权才能继续这一步。当前预览阶段授权后可能仍需重试一次。";
  }
  return raw;
}

function getApprovalTurnId(request: ApprovalRequest): string | null {
  const turnId = request.params?.turnId ?? request.params?.turn_id;
  return typeof turnId === "string" && turnId.trim() ? turnId.trim() : null;
}

export function ApprovalToasts({
  approvals,
  workspaces,
  onDecision,
  onApproveBatch,
  onRemember,
}: ApprovalToastsProps) {
  const { t } = useTranslation();
  const workspaceLabels = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces],
  );

  const primaryRequest = approvals[approvals.length - 1];
  const primaryTurnId = primaryRequest ? getApprovalTurnId(primaryRequest) : null;
  const turnBatch = primaryRequest
    ? approvals.filter(
        (request) =>
          request.workspace_id === primaryRequest.workspace_id &&
          getApprovalTurnId(request) === primaryTurnId,
      )
    : [];
  const batchCount = turnBatch.length;

  useEffect(() => {
    if (!primaryRequest) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      onDecision(primaryRequest, "accept");
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDecision, primaryRequest]);

  if (!approvals.length) {
    return null;
  }

  const remainingCount = Math.max(0, approvals.length - 1);

  const formatLabel = (value: string) =>
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .trim();

  const renderParamValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return { text: t("approval.none"), isCode: false };
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return { text: String(value), isCode: false };
    }
    if (Array.isArray(value)) {
      if (value.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
        return { text: value.map(String).join(", "), isCode: false };
      }
      return { text: JSON.stringify(value, null, 2), isCode: true };
    }
    return { text: JSON.stringify(value, null, 2), isCode: true };
  };

  return (
    <div className="approval-toasts" role="region" aria-live="assertive">
      {[primaryRequest].map((request) => {
        const workspaceName = workspaceLabels.get(request.workspace_id);
        const params = request.params ?? {};
        const commandInfo = getApprovalCommandInfo(params);
        const approvalPath = getApprovalPath(params);
        const approvalMessage = getApprovalMessage(params);
        const entries = Object.entries(params).filter(([key, value]) => {
          if (HIDDEN_APPROVAL_PARAM_KEYS.has(key)) {
            return false;
          }
          if (approvalPath && value === approvalPath) {
            return false;
          }
          if (commandInfo && (key === "command" || key === "cmd")) {
            return false;
          }
          return value !== undefined && value !== null && value !== "";
        });
        return (
          <div
            key={`${request.workspace_id}-${request.request_id}`}
            className="approval-toast"
            role="alert"
          >
            {remainingCount > 0 ? (
              <div className="approval-toast-queue-summary">
                {t("approval.remainingRequests", { count: remainingCount })}
              </div>
            ) : null}
            <div className="approval-toast-header">
              <div className="approval-toast-title">{t("approval.approvalNeeded")}</div>
              {workspaceName ? (
                <div className="approval-toast-workspace">{workspaceName}</div>
              ) : null}
            </div>
            <div className="approval-toast-method">{getToolLabel(request.method)}</div>
            <div className="approval-toast-details">
              {approvalPath ? (
                <div className="approval-toast-detail">
                  <div className="approval-toast-detail-label">File path</div>
                  <div className="approval-toast-detail-value">{approvalPath}</div>
                </div>
              ) : null}
              {commandInfo ? (
                <div className="approval-toast-detail">
                  <div className="approval-toast-detail-label">Command</div>
                  <div className="approval-toast-detail-value">{commandInfo.preview}</div>
                </div>
              ) : null}
              {typeof params.toolName === "string" && params.toolName.trim() ? (
                <div className="approval-toast-detail">
                  <div className="approval-toast-detail-label">Tool</div>
                  <div className="approval-toast-detail-value">{params.toolName.trim()}</div>
                </div>
              ) : null}
              {approvalMessage ? (
                <div className="approval-toast-detail">
                  <div className="approval-toast-detail-label">Note</div>
                  <div className="approval-toast-detail-value">{approvalMessage}</div>
                </div>
              ) : null}
              {entries.length ? (
                entries.map(([key, value]) => {
                  const rendered = renderParamValue(value);
                  return (
                    <div key={key} className="approval-toast-detail">
                      <div className="approval-toast-detail-label">
                        {formatLabel(key)}
                      </div>
                      {rendered.isCode ? (
                        <pre className="approval-toast-detail-code">
                          {rendered.text}
                        </pre>
                      ) : (
                        <div className="approval-toast-detail-value">
                          {rendered.text}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : !approvalPath && !commandInfo && !approvalMessage ? (
                <div className="approval-toast-detail approval-toast-detail-empty">
                  {t("approval.noExtraDetails")}
                </div>
              ) : null}
            </div>
            <div className="approval-toast-actions">
              <button
                className="secondary"
                onClick={() => onDecision(request, "decline")}
              >
                {t("approval.decline")}
              </button>
              {batchCount > 1 && onApproveBatch ? (
                <button
                  className="secondary"
                  onClick={() => onApproveBatch(request)}
                >
                  {t("approval.approveTurnBatch", { count: batchCount })}
                </button>
              ) : null}
              {commandInfo && onRemember ? (
                <button
                  className="ghost approval-toast-remember"
                  onClick={() => onRemember(request, commandInfo.tokens)}
                  title={t("approval.allowCommandsStartWith", { prefix: commandInfo.preview })}
                >
                  {t("approval.alwaysAllow")}
                </button>
              ) : null}
              <button
                className="primary"
                onClick={() => onDecision(request, "accept")}
              >
                {t("approval.approveEnter")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
