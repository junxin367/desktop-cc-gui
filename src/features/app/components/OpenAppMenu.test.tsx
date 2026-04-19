// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAppMenu } from "./OpenAppMenu";

const useOpenAppIconsMock = vi.fn<
  (targets: unknown, options?: unknown) => Record<string, string>
>(() => ({}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  openWorkspaceIn: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

vi.mock("../../../services/clientStorage", () => ({
  writeClientStoreValue: vi.fn(),
}));

vi.mock("../hooks/useOpenAppIcons", () => ({
  useOpenAppIcons: (...args: unknown[]) => useOpenAppIconsMock(args[0], args[1]),
}));

describe("OpenAppMenu", () => {
  const selectedLabelPattern = /(?:Open in VS Code|settings\.openInTarget)/;
  const customSelectedLabelPattern = /(?:Open in Custom Editor|settings\.openInTarget)/;

  beforeEach(() => {
    vi.useFakeTimers();
    useOpenAppIconsMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows a tooltip for the selected app trigger on hover", async () => {
    render(
      <OpenAppMenu
        path="/tmp/demo"
        openTargets={[
          {
            id: "vscode",
            label: "VS Code",
            kind: "app",
            appName: "Visual Studio Code",
            command: null,
            args: [],
          },
        ]}
        selectedOpenAppId="vscode"
        onSelectOpenAppId={vi.fn()}
        iconOnly
      />,
    );

    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole("button", { name: selectedLabelPattern }));
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(screen.getByRole("tooltip").textContent).toMatch(selectedLabelPattern);
  });

  it("only enables lazy icon loading after the menu is opened", () => {
    render(
      <OpenAppMenu
        path="/tmp/demo"
        openTargets={[
          {
            id: "custom-editor",
            label: "Custom Editor",
            kind: "app",
            appName: "Custom Editor",
            command: null,
            args: [],
          },
        ]}
        selectedOpenAppId="custom-editor"
        onSelectOpenAppId={vi.fn()}
        iconOnly
      />,
    );

    expect(useOpenAppIconsMock).toHaveBeenCalledWith(
      [
        {
          id: "custom-editor",
          label: "Custom Editor",
          kind: "app",
          appName: "Custom Editor",
          command: null,
          args: [],
        },
      ],
      { enabled: false },
    );

    fireEvent.click(screen.getByRole("button", { name: customSelectedLabelPattern }));

    expect(useOpenAppIconsMock).toHaveBeenLastCalledWith(
      [
        {
          id: "custom-editor",
          label: "Custom Editor",
          kind: "app",
          appName: "Custom Editor",
          command: null,
          args: [],
        },
      ],
      { enabled: true },
    );
  });
});
