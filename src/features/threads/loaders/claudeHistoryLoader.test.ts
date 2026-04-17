import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { parseClaudeHistoryMessages } from "./claudeHistoryLoader";

type AssistantMessageItem = Extract<ConversationItem, { kind: "message" }> & {
  role: "assistant";
};

describe("parseClaudeHistoryMessages", () => {
  it("preserves transcript-style bash output and command metadata", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-1",
        tool_name: "bash",
        tool_input: {
          command: "git log --oneline -10",
          description: "查看最近的 git 提交历史",
        },
      },
      {
        kind: "tool",
        id: "tool-1-result",
        toolType: "result",
        text: "",
        tool_output: {
          output: "abc123 first commit\ndef456 second commit\n",
          exit: 0,
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-1",
      kind: "tool",
      toolType: "bash",
      title: "bash",
      status: "completed",
      output: "abc123 first commit\ndef456 second commit\n",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("git log --oneline -10");
      expect(items[0].detail).toContain("查看最近的 git 提交历史");
    }
  });

  it("preserves non-command tool input payload for read tools", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-read-1",
        tool_name: "read_file",
        tool_input: {
          file_path: "/workspace/README.md",
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-read-1",
      kind: "tool",
      toolType: "read_file",
      title: "read_file",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("file_path");
      expect(items[0].detail).toContain("/workspace/README.md");
    }
  });

  it("preserves full command tool_input payload so session activity can read cwd/argv", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-bash-1",
        tool_name: "bash",
        tool_input: {
          argv: ["zsh", "-lc", "pnpm vitest"],
          cwd: "/workspace/project",
          description: "run tests",
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-bash-1",
      kind: "tool",
      toolType: "bash",
      title: "bash",
      status: "started",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("argv");
      expect(items[0].detail).toContain("/workspace/project");
      expect(items[0].detail).toContain("run tests");
    }
  });

  it("maps AskUserQuestion user answer message into submitted history block", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-ask-1",
        tool_name: "AskUserQuestion",
        input: {
          questions: [
            {
              id: "q-0",
              header: "技术偏好",
              question: "你关注哪些方面？",
              options: [
                { label: "代码质量", description: "可维护性" },
                { label: "性能优化", description: "响应速度" },
              ],
            },
          ],
        },
      },
      {
        kind: "message",
        role: "user",
        id: "msg-user-1",
        text: "The user answered the AskUserQuestion: 代码质量, 性能优化. Please continue based on this selection.",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "tool-ask-1",
      kind: "tool",
      toolType: "AskUserQuestion",
      status: "completed",
      output: "代码质量, 性能优化",
    });
    expect(items[1]).toMatchObject({
      id: "request-user-input-submitted-tool-ask-1",
      kind: "tool",
      toolType: "requestUserInputSubmitted",
      status: "completed",
    });
    if (items[1]?.kind === "tool") {
      const parsed = JSON.parse(items[1].detail);
      expect(parsed.schema).toBe("requestUserInputSubmitted/v1");
      expect(parsed.questions[0].question).toBe("你关注哪些方面？");
      expect(parsed.questions[0].selectedOptions).toEqual([
        "代码质量",
        "性能优化",
      ]);
    }
  });

  it("keeps user image attachments for message rows even when text is empty", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "msg-user-image-1",
        text: "",
        images: ["data:image/png;base64,AAAA"],
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "msg-user-image-1",
      kind: "message",
      role: "user",
      images: ["data:image/png;base64,AAAA"],
    });
  });

  it("parses legacy single-question AskUserQuestion payloads and answer text variants", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-ask-legacy-1",
        tool_name: "AskUserQuestion",
        tool_input: {
          header: "项目类型",
          question: "请选择一个项目类型",
          options: [
            { label: "Web应用", description: "浏览器端项目" },
            { label: "CLI工具", description: "命令行项目" },
          ],
        },
      },
      {
        kind: "message",
        role: "user",
        id: "msg-user-legacy-1",
        text: "The user answered the AskUserQuestion: Web应用 Please continue based on this selection.",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "tool-ask-legacy-1",
      kind: "tool",
      status: "completed",
      output: "Web应用",
    });
    expect(items[1]).toMatchObject({
      id: "request-user-input-submitted-tool-ask-legacy-1",
      kind: "tool",
      toolType: "requestUserInputSubmitted",
      status: "completed",
    });
    if (items[1]?.kind === "tool") {
      const parsed = JSON.parse(items[1].detail);
      expect(parsed.questions[0].question).toBe("请选择一个项目类型");
      expect(parsed.questions[0].selectedOptions).toEqual(["Web应用"]);
    }
  });

  it("marks the last assistant message of each turn as final for history restore", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-1",
        text: "Q1",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-1a",
        text: "A1-part1",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-1b",
        text: "A1-part2",
      },
      {
        kind: "message",
        role: "user",
        id: "user-2",
        text: "Q2",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-2",
        text: "A2",
      },
    ]);

    const assistantItems = items.filter(
      (item): item is AssistantMessageItem =>
        item.kind === "message" && item.role === "assistant",
    );

    expect(assistantItems).toHaveLength(3);
    expect(assistantItems[0]?.id).toBe("assistant-1a");
    expect(assistantItems[0]?.isFinal).not.toBe(true);
    expect(assistantItems[1]?.id).toBe("assistant-1b");
    expect(assistantItems[1]?.isFinal).toBe(true);
    expect(assistantItems[2]?.id).toBe("assistant-2");
    expect(assistantItems[2]?.isFinal).toBe(true);
  });

  it("respects explicit assistant final flags from Claude history rows", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-1",
        text: "Q1",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-explicit-1",
        text: "A1",
        metadata: { is_final: true },
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-explicit-2",
        text: "A1 follow-up",
      },
    ]);

    const assistantItems = items.filter(
      (item): item is AssistantMessageItem =>
        item.kind === "message" && item.role === "assistant",
    );

    expect(assistantItems).toHaveLength(2);
    expect(assistantItems[0]?.id).toBe("assistant-explicit-1");
    expect(assistantItems[0]?.isFinal).toBe(true);
    expect(assistantItems[1]?.id).toBe("assistant-explicit-2");
    expect(assistantItems[1]?.isFinal).not.toBe(true);
  });

  it("hydrates final completion time and duration from Claude message timestamps", () => {
    const startedAt = "2026-04-01T08:00:00.000Z";
    const completedAt = "2026-04-01T08:00:07.000Z";
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-timed-1",
        text: "Q1",
        timestamp: startedAt,
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-timed-1",
        text: "A1",
        timestamp: completedAt,
      },
    ]);

    const assistant = items.find(
      (item): item is AssistantMessageItem =>
        item.kind === "message" && item.role === "assistant",
    );

    expect(assistant).toBeTruthy();
    expect(assistant?.isFinal).toBe(true);
    expect(assistant?.finalCompletedAt).toBe(Date.parse(completedAt));
    expect(assistant?.finalDurationMs).toBe(7_000);
  });

  it("reconstructs synthetic approval resume assistant text into file change history items", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "assistant",
        id: "assistant-approval-resume-1",
        text: [
          "Completed approved operations:",
          "- Approved and wrote ccc.txt",
          "- Approved and wrote bbb.txt",
          "- Approved and wrote aaa1.txt",
          "Please continue from the current workspace state and finish the original task.",
        ].join("\n"),
      },
    ]);

    expect(items).toHaveLength(3);
    expect(items).toEqual([
      expect.objectContaining({
        id: "assistant-approval-resume-1-approval-1",
        kind: "tool",
        toolType: "fileChange",
        status: "completed",
        output: "Approved and wrote ccc.txt",
        changes: [expect.objectContaining({ path: "ccc.txt", kind: "add" })],
      }),
      expect.objectContaining({
        id: "assistant-approval-resume-1-approval-2",
        kind: "tool",
        toolType: "fileChange",
        status: "completed",
        output: "Approved and wrote bbb.txt",
        changes: [expect.objectContaining({ path: "bbb.txt", kind: "add" })],
      }),
      expect.objectContaining({
        id: "assistant-approval-resume-1-approval-3",
        kind: "tool",
        toolType: "fileChange",
        status: "completed",
        output: "Approved and wrote aaa1.txt",
        changes: [expect.objectContaining({ path: "aaa1.txt", kind: "add" })],
      }),
    ]);
  });

  it("prefers structured approval resume marker over english summary parsing", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "assistant",
        id: "assistant-approval-marker-1",
        text: [
          '<ccgui-approval-resume>[{"summary":"Approved and updated ccc.txt","path":"ccc.txt","kind":"modified","status":"completed"},{"summary":"Approved and wrote aaa1.txt","path":"aaa1.txt","kind":"add","status":"completed"}]</ccgui-approval-resume>',
          "Completed approved operations:",
          "- Approved and wrote wrong.txt",
          "Please continue from the current workspace state and finish the original task.",
        ].join("\n"),
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "assistant-approval-marker-1-approval-1",
        kind: "tool",
        toolType: "fileChange",
        output: "Approved and updated ccc.txt",
        changes: [expect.objectContaining({ path: "ccc.txt", kind: "modified" })],
      }),
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        id: "assistant-approval-marker-1-approval-2",
        kind: "tool",
        toolType: "fileChange",
        output: "Approved and wrote aaa1.txt",
        changes: [expect.objectContaining({ path: "aaa1.txt", kind: "add" })],
      }),
    );
  });

  it("skips synthetic approval resume prompts that were injected as user messages", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-real-1",
        text: "创建三个文件",
      },
      {
        kind: "message",
        role: "user",
        id: "user-internal-approval-resume",
        text: [
          '<ccgui-approval-resume>[{"summary":"Approved and wrote bbb.txt","path":"bbb.txt","kind":"add","status":"completed"}]</ccgui-approval-resume>',
          "Approved and wrote bbb.txt",
          "Please continue from the current workspace state and finish the original task.",
        ].join("\n"),
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-final-1",
        text: "三个文件都创建好了。",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "user-real-1",
      kind: "message",
      role: "user",
      text: "创建三个文件",
    });
    expect(items[1]).toMatchObject({
      id: "assistant-final-1",
      kind: "message",
      role: "assistant",
      text: "三个文件都创建好了。",
    });
  });
});
