import { describe, expect, it } from "vitest";
import { getVsCodeThemePreset } from "../constants/vscodeThemePresets";
import { mapVsCodeColorsToTokens } from "./mapVsCodeColorsToTokens";

describe("mapVsCodeColorsToTokens", () => {
  it("maps dark modern preset to the expected surface and terminal tokens", () => {
    const tokens = mapVsCodeColorsToTokens(
      getVsCodeThemePreset("vscode-dark-modern"),
    );

    expect(tokens["--surface-sidebar"]).toBe("#181818");
    expect(tokens["--surface-messages"]).toBe("#1f1f1f");
    expect(tokens["--primary"]).toBe("#0078d4");
    expect(tokens["--theme-terminal-background"]).toBe("#1f1f1f");
    expect(tokens["--diff-added-text"]).toBe("#2ea043");
  });

  it("maps light plus preset to the expected light palette tokens", () => {
    const tokens = mapVsCodeColorsToTokens(
      getVsCodeThemePreset("vscode-light-plus"),
    );

    expect(tokens["--text-primary"]).toBe("#3b3b3b");
    expect(tokens["--surface-sidebar"]).toBe("#f3f3f3");
    expect(tokens["--border-accent"]).toBe("#007acc");
    expect(tokens["--theme-terminal-cursor"]).toBe("#000000");
    expect(tokens["--dropdown-bg"]).toBe("#ffffff");
  });
});
