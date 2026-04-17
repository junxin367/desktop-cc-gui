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
});
