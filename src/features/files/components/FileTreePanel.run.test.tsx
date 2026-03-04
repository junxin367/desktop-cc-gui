// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { OpenAppTarget } from "../../../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (value: string) => value,
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: vi.fn(async () => ({
      append: vi.fn(async () => undefined),
      popup: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    })),
  },
  MenuItem: {
    new: vi.fn(async () => ({})),
  },
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class {},
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    scaleFactor: vi.fn(async () => 1),
  })),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
}));

let FileTreePanel: typeof import("./FileTreePanel").FileTreePanel;

beforeAll(async () => {
  ({ FileTreePanel } = await import("./FileTreePanel"));
});

afterEach(() => {
  cleanup();
});

describe("FileTreePanel run action isolation", () => {
  it("filters files by search input", () => {
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={["src/index.ts", "README.md"]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    expect(screen.getByText("README.md")).toBeTruthy();
    const filterInput = screen.getByRole("searchbox", {
      name: "files.filterPlaceholder",
    });
    fireEvent.change(filterInput, { target: { value: "src/" } });
    expect(screen.queryByText("README.md")).toBeNull();
    expect(screen.getByText("src")).toBeTruthy();
  });

  it("renders empty directories from workspace directory snapshot", () => {
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={["README.md"]}
        directories={["empty-dir"]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    expect(screen.getByText("empty-dir")).toBeTruthy();
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("renders single-child empty directory chains in a.b.c style", () => {
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={[]}
        directories={["a/b/c"]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    expect(screen.getByText("a.b.c")).toBeTruthy();
  });

  it("keeps matched empty directories visible when filtering", () => {
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={["README.md"]}
        directories={["empty-dir"]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    const filterInput = screen.getByRole("searchbox", {
      name: "files.filterPlaceholder",
    });
    fireEvent.change(filterInput, { target: { value: "empty" } });

    expect(screen.getByText("empty-dir")).toBeTruthy();
    expect(screen.queryByText("README.md")).toBeNull();
  });

  it("does not render run icon button in file tree search bar", () => {
    const openTargets: OpenAppTarget[] = [];

    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={[]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={() => undefined}
        openTargets={openTargets}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    expect(screen.queryByRole("button", { name: "files.openRunConsole" })).toBeNull();
  });

  it("renders run icon button and triggers toggle when handler is provided", () => {
    const onToggleRuntimeConsole = vi.fn();
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={[]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        onToggleRuntimeConsole={onToggleRuntimeConsole}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    const runButton = screen.getByRole("button", { name: "files.openRunConsole" });
    fireEvent.click(runButton);
    expect(onToggleRuntimeConsole).toHaveBeenCalledTimes(1);
  });

  it("renders spec hub icon button and triggers toggle when handler is provided", () => {
    const onOpenSpecHub = vi.fn();
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={[]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        onOpenSpecHub={onOpenSpecHub}
        isSpecHubActive
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    const specHubButton = screen.getByRole("button", { name: "sidebar.specHub" });
    expect(specHubButton.className).toContain("is-active");
    fireEvent.click(specHubButton);
    expect(onOpenSpecHub).toHaveBeenCalledTimes(1);
  });

  it("keeps file open interactions available after clicking run toggle", () => {
    const onToggleRuntimeConsole = vi.fn();
    const onOpenFile = vi.fn();
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={["src/index.ts", "README.md"]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={onOpenFile}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        onToggleRuntimeConsole={onToggleRuntimeConsole}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "files.openRunConsole" }));
    fireEvent.click(screen.getByRole("button", { name: "README.md" }));

    expect(onToggleRuntimeConsole).toHaveBeenCalledTimes(1);
    expect(onOpenFile).toHaveBeenCalledWith("README.md");
  });

  it("clicking folder row toggles children without opening file", () => {
    const onOpenFile = vi.fn();
    render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath="/tmp/workspace"
        files={["src/index.ts"]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={onOpenFile}
        onInsertText={() => undefined}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    expect(screen.queryByText("index.ts")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /src/ }));
    expect(screen.getByText("index.ts")).toBeTruthy();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("mentions file using Windows-style absolute path when workspace path uses backslashes", () => {
    const onInsertText = vi.fn();

    const { container } = render(
      <FileTreePanel
        workspaceId="workspace-1"
        workspacePath={"C:\\workspace\\demo"}
        files={["index.ts"]}
        isLoading={false}
        filePanelMode="files"
        onFilePanelModeChange={() => undefined}
        onOpenFile={() => undefined}
        onInsertText={onInsertText}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={() => undefined}
        gitStatusFiles={[]}
        gitignoredFiles={new Set<string>()}
      />,
    );

    const mentionButton = container.querySelector(".file-tree-action") as HTMLButtonElement | null;
    expect(mentionButton).not.toBeNull();
    fireEvent.click(mentionButton as HTMLButtonElement);

    expect(onInsertText).toHaveBeenCalledWith(
      "@C:\\workspace\\demo\\index.ts ",
    );
  });
});
