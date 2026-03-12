import { useCallback, useMemo, type MouseEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { highlightLine } from "../../../utils/syntax";

type FileMarkdownPreviewProps = {
  value: string;
  className?: string;
};

type PreviewPreNode = {
  children?: Array<{
    tagName?: string;
    properties?: { className?: string[] | string };
    children?: Array<{ value?: string }>;
  }>;
};

function extractLanguageTag(className?: string) {
  if (!className) {
    return null;
  }
  const match = className.match(/language-([\w-]+)/i);
  return match?.[1] ?? null;
}

function extractCodeFromPre(node?: PreviewPreNode) {
  const codeNode = node?.children?.find((child) => child.tagName === "code");
  const className = codeNode?.properties?.className;
  const normalizedClassName = Array.isArray(className)
    ? className.join(" ")
    : className;
  const value =
    codeNode?.children?.map((child) => child.value ?? "").join("") ?? "";
  return {
    className: normalizedClassName,
    value: value.replace(/\n$/, ""),
  };
}

function FileMarkdownCodeBlock({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  const languageTag = extractLanguageTag(className);
  const highlightedHtml = useMemo(
    () => highlightLine(value, languageTag),
    [languageTag, value],
  );

  return (
    <div className="fvp-file-markdown-codeblock">
      {languageTag ? (
        <div className="fvp-file-markdown-codeblock-label">{languageTag}</div>
      ) : null}
      <pre>
        <code
          className={className}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

export function FileMarkdownPreview({
  value,
  className = "fvp-file-markdown",
}: FileMarkdownPreviewProps) {
  const rehypePlugins = useMemo(
    () => [
      rehypeRaw,
      [rehypeSanitize, {
        ...defaultSchema,
        tagNames: [
          ...(defaultSchema.tagNames ?? []),
          "details",
          "summary",
          "abbr",
          "mark",
          "ins",
          "del",
          "sub",
          "sup",
          "kbd",
          "var",
          "samp",
        ],
        attributes: {
          ...defaultSchema.attributes,
          "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "class"],
        },
      }],
    ] as Parameters<typeof ReactMarkdown>[0]["rehypePlugins"],
    [],
  );

  const handleAnchorClick = useCallback((event: MouseEvent, href?: string) => {
    if (!href) {
      return;
    }
    const isExternal =
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:");
    if (!isExternal) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void openUrl(href);
  }, []);

  const components = useMemo<Components>(() => ({
    a: ({ href, children }) => (
      <a href={href} onClick={(event) => handleAnchorClick(event, href)}>
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="fvp-file-markdown-table-wrap">
        <table>{children}</table>
      </div>
    ),
    pre: ({ node, children }) => {
      const { className: codeClassName, value: codeValue } = extractCodeFromPre(
        node as PreviewPreNode,
      );
      if (!codeClassName && !codeValue) {
        return <pre>{children}</pre>;
      }
      return (
        <FileMarkdownCodeBlock
          className={codeClassName}
          value={codeValue}
        />
      );
    },
  }), [handleAnchorClick]);

  return (
    <div className={className} data-testid="file-markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
