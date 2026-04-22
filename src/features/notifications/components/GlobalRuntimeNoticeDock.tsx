import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GlobalRuntimeNotice } from "../../../services/globalRuntimeNotices";
import type {
  GlobalRuntimeNoticeDockStatus,
  GlobalRuntimeNoticeDockVisibility,
} from "../hooks/useGlobalRuntimeNoticeDock";

type GlobalRuntimeNoticeDockProps = {
  notices: readonly GlobalRuntimeNotice[];
  visibility: GlobalRuntimeNoticeDockVisibility;
  status: GlobalRuntimeNoticeDockStatus;
  onExpand: () => void;
  onMinimize: () => void;
  onClear: () => void;
};

type MinimizedIndicatorState = "idle" | "has-notice" | "has-error";

function formatNoticeTimestamp(timestampMs: number) {
  const date = new Date(timestampMs);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function resolveStatusLabel(
  t: (key: string) => string,
  status: GlobalRuntimeNoticeDockStatus,
) {
  switch (status) {
    case "has-error":
      return t("runtimeNotice.statusError");
    case "streaming":
      return t("runtimeNotice.statusStreaming");
    case "idle":
    default:
      return t("runtimeNotice.statusIdle");
  }
}

function resolveSeverityLabel(
  t: (key: string) => string,
  severity: GlobalRuntimeNotice["severity"],
) {
  switch (severity) {
    case "warning":
      return t("runtimeNotice.severityWarning");
    case "error":
      return t("runtimeNotice.severityError");
    case "info":
    default:
      return t("runtimeNotice.severityInfo");
  }
}

function resolveMinimizedIndicatorState(
  status: GlobalRuntimeNoticeDockStatus,
  hasNoticeItems: boolean,
): MinimizedIndicatorState {
  if (status === "has-error") {
    return "has-error";
  }
  if (status === "idle" && !hasNoticeItems) {
    return "idle";
  }
  return "has-notice";
}

export function GlobalRuntimeNoticeDock({
  notices,
  visibility,
  status,
  onExpand,
  onMinimize,
  onClear,
}: GlobalRuntimeNoticeDockProps) {
  const { t } = useTranslation();
  const statusLabel = resolveStatusLabel(t, status);
  const isMinimized = visibility === "minimized";
  const hasNoticeItems = notices.length > 0;
  const minimizedIndicatorState = resolveMinimizedIndicatorState(status, hasNoticeItems);

  const renderedRows = useMemo(
    () =>
      notices.map((notice) => {
        const translatedMessage = t(notice.messageKey, notice.messageParams);
        const severityLabel = resolveSeverityLabel(t, notice.severity);
        const timestampLabel = formatNoticeTimestamp(notice.timestampMs);
        const messageLabel =
          notice.repeatCount > 1 ? `${translatedMessage} ×${notice.repeatCount}` : translatedMessage;
        return {
          id: notice.id,
          severity: notice.severity,
          messageLabel,
          timestampLabel,
          ariaLabel: `${severityLabel} ${messageLabel} ${timestampLabel}`,
        };
      }),
    [notices, t],
  );

  return (
    <div className="global-runtime-notice-dock-shell">
      {isMinimized ? (
        <button
          type="button"
          className={`global-runtime-notice-dock-bubble is-${minimizedIndicatorState}`}
          onClick={onExpand}
          aria-label={t("runtimeNotice.open")}
          title={t("runtimeNotice.open")}
        >
          {minimizedIndicatorState === "idle" ? (
            <span className="global-runtime-notice-dock-indicator-dot" aria-hidden="true" />
          ) : (
            <span className="global-runtime-notice-dock-indicator-mark" aria-hidden="true">
              !
            </span>
          )}
        </button>
      ) : (
        <section
          className="global-runtime-notice-dock"
          role="region"
          aria-label={t("runtimeNotice.title")}
        >
          <header className="global-runtime-notice-dock-header">
            <div className="global-runtime-notice-dock-title-wrap">
              <span className="global-runtime-notice-dock-title">
                {t("runtimeNotice.title")}
              </span>
              <span className={`global-runtime-notice-dock-status is-${status}`}>
                {statusLabel}
              </span>
            </div>
            <div className="global-runtime-notice-dock-actions">
              <button
                type="button"
                className="global-runtime-notice-dock-action"
                onClick={onClear}
              >
                {t("runtimeNotice.clear")}
              </button>
              <button
                type="button"
                className="global-runtime-notice-dock-action"
                onClick={onMinimize}
              >
                {t("runtimeNotice.minimize")}
              </button>
            </div>
          </header>
          {hasNoticeItems ? (
            <ol className="global-runtime-notice-dock-list">
              {renderedRows.map((row) => (
                <li
                  key={row.id}
                  className={`global-runtime-notice-dock-row is-${row.severity}`}
                  aria-label={row.ariaLabel}
                >
                  <span
                    className={`global-runtime-notice-dock-severity is-${row.severity}`}
                    aria-hidden="true"
                  />
                  <span
                    className="global-runtime-notice-dock-message"
                    title={row.messageLabel}
                  >
                    {row.messageLabel}
                  </span>
                  <time className="global-runtime-notice-dock-time">
                    {row.timestampLabel}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <div className="global-runtime-notice-dock-empty">
              <div className="global-runtime-notice-dock-empty-title">
                {t("runtimeNotice.emptyTitle")}
              </div>
              <div className="global-runtime-notice-dock-empty-description">
                {t("runtimeNotice.emptyDescription")}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
