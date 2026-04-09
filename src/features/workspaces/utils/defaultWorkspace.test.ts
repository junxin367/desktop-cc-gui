import { describe, expect, it } from "vitest";
import { isDefaultWorkspacePath } from "./defaultWorkspace";

describe("defaultWorkspace", () => {
  it("matches mac/unix codemoss default workspace path", () => {
    expect(isDefaultWorkspacePath("/Users/chen/.codemoss/workspace")).toBe(true);
    expect(isDefaultWorkspacePath("/Users/chen/.codemoss/workspace/")).toBe(true);
  });

  it("matches Windows-style path case-insensitively", () => {
    expect(isDefaultWorkspacePath("C:\\Users\\CHEN\\.CodeMoss\\Workspace")).toBe(true);
  });

  it("does not match lookalike suffixes such as workspace-backup", () => {
    expect(isDefaultWorkspacePath("/Users/chen/.codemoss/workspace-backup")).toBe(
      false,
    );
    expect(isDefaultWorkspacePath("C:\\Users\\chen\\.codemoss\\workspace_temp")).toBe(
      false,
    );
  });

  it("does not match nested child directories under default workspace root", () => {
    expect(isDefaultWorkspacePath("/Users/chen/.codemoss/workspace/project-a")).toBe(
      false,
    );
  });
});
