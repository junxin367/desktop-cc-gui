import { describe, expect, it } from "vitest";
import { mergeCompletedAgentText } from "./threadReducerTextMerge";

describe("threadReducerTextMerge", () => {
  it("strips synthetic Claude approval resume text from completed assistant payloads", () => {
    const completed = [
      "文件已经创建完成。",
      "",
      "Completed approved operations:",
      "- Created aaa.txt",
      "- Updated bbb.txt",
      "Please continue from the current workspace state and finish the original task.",
      "",
      "No response requested.",
    ].join("\n");

    expect(mergeCompletedAgentText("", completed)).toBe("文件已经创建完成。");
  });

  it("collapses near-duplicate completed paragraph blocks into one readable result", () => {
    const firstPass = [
      "先按仓库规范做一次基线扫描。",
      "我会检查项目内的 `.claude/`、`.codex/`、`openspec/`，再看目录结构和技术栈。",
      "最后给你一个简明项目分析。",
    ].join("\n\n");
    const secondPass = [
      "先按仓库规范做一次基线扫描。",
      "我会先检查项目内的 `.claude/`、`.codex/`、`openspec/`，再快速看目录结构和技术栈。",
      "最后给你一个简明的项目分析。",
    ].join("\n\n");

    expect(mergeCompletedAgentText(firstPass, `${firstPass}\n\n${secondPass}`)).toBe(secondPass);
  });
});
