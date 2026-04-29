import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  isThemeMutationAttribute,
  mapAppearanceToMermaidTheme,
  readDocumentThemeAppearance,
} from "../../theme/utils/themeAppearance";

type MermaidBlockProps = {
  value: string;
  copyUseModifier: boolean;
};

type RenderState =
  | { status: "idle" }
  | { status: "rendering" }
  | { status: "success"; svg: string }
  | { status: "error"; message: string };

function detectMermaidTheme(): "dark" | "default" {
  return mapAppearanceToMermaidTheme(readDocumentThemeAppearance());
}

export default function MermaidBlock({
  value,
  copyUseModifier,
}: MermaidBlockProps) {
  const { t } = useTranslation();
  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
  });
  const [showSource, setShowSource] = useState(false);
  const [copiedMode, setCopiedMode] = useState<"plain" | "fenced" | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const copyTimeoutRef = useRef<number | null>(null);
  const idRef = useRef(`mermaid-${crypto.randomUUID()}`);

  // debounce value for streaming output – use a longer delay to avoid
  // repeatedly re-rendering expensive Mermaid diagrams while chunks arrive.
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), 800);
    return () => window.clearTimeout(timer);
  }, [value]);

  // render mermaid diagram
  useEffect(() => {
    let cancelled = false;
    setRenderState({ status: "rendering" });

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const theme = detectMermaidTheme();
        mermaid.initialize({
          startOnLoad: false,
          theme,
          securityLevel: "strict",
          fontFamily:
            "ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
        });

        // mermaid.render requires a unique id each call
        const id = `${idRef.current}-${Date.now()}`;
        const { svg } = await mermaid.render(id, debouncedValue);
        if (!cancelled) {
          setRenderState({ status: "success", svg });
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : String(error);
          setRenderState({ status: "error", message });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedValue, renderKey]);

  // re-render on theme change
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (isThemeMutationAttribute(mutation.attributeName)) {
          setRenderKey((prev) => prev + 1);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const fencedValue = `\`\`\`mermaid\n${value}\n\`\`\``;

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    try {
      const nextValue = copyUseModifier && event.altKey ? fencedValue : value;
      await navigator.clipboard.writeText(nextValue);
      setCopiedMode(nextValue === fencedValue ? "fenced" : "plain");
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedMode(null);
      }, 1200);
    } catch {
      // clipboard errors can occur in restricted contexts
    }
  };

  const handleCopyFenced = async () => {
    try {
      await navigator.clipboard.writeText(fencedValue);
      setCopiedMode("fenced");
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedMode(null);
      }, 1200);
    } catch {
      // clipboard errors can occur in restricted contexts
    }
  };

  const handleToggleSource = () => {
    setShowSource((prev) => !prev);
  };

  return (
    <div className="markdown-codeblock markdown-mermaidblock">
      <div className="markdown-codeblock-header">
        <span className="markdown-codeblock-language">Mermaid</span>
        <div className="markdown-mermaidblock-actions">
          <button
            type="button"
            className="ghost markdown-codeblock-copy"
            onClick={handleToggleSource}
          >
            {showSource ? "Preview" : "Source"}
          </button>
          <button
            type="button"
            className={`ghost markdown-codeblock-copy${copiedMode === "plain" ? " is-copied" : ""}`}
            onClick={handleCopy}
            aria-label={t("messages.copyCodeBlock")}
            title={copiedMode === "plain" ? t("messages.copied") : t("messages.copy")}
          >
            {copiedMode === "plain" ? t("messages.copied") : t("messages.copy")}
          </button>
          <button
            type="button"
            className={`ghost markdown-codeblock-copy${copiedMode === "fenced" ? " is-copied" : ""}`}
            onClick={handleCopyFenced}
            aria-label={t("messages.copyCodeBlockWithFence")}
            title={copiedMode === "fenced" ? t("messages.copied") : t("messages.copyWithFence")}
          >
            {copiedMode === "fenced" ? t("messages.copied") : t("messages.copyWithFence")}
          </button>
        </div>
      </div>

      {showSource ? (
        <pre>
          <code className="language-mermaid">{value}</code>
        </pre>
      ) : renderState.status === "success" ? (
        <div
          className="markdown-mermaidblock-diagram"
          dangerouslySetInnerHTML={{ __html: renderState.svg }}
        />
      ) : renderState.status === "error" ? (
        <div className="markdown-mermaidblock-error">
          <div className="markdown-mermaidblock-error-hint">
            Render failed: {renderState.message}
          </div>
          <pre>
            <code className="language-mermaid">{value}</code>
          </pre>
        </div>
      ) : (
        <div className="markdown-mermaidblock-loading">
          Rendering diagram...
        </div>
      )}
    </div>
  );
}
