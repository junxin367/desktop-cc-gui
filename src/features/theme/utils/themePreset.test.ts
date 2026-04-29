import { describe, expect, it } from "vitest";
import type { AppSettings } from "../../../types";
import {
  buildSettingsWithCustomThemePreset,
  buildSettingsWithThemePreset,
  getAllThemePresetOptions,
  resolveActiveThemePresetId,
  resolveCustomThemePresetId,
  resolveEffectiveThemeAppearance,
  resolveThemePresetIdForAppearance,
  sanitizeDarkThemePresetId,
  sanitizeLightThemePresetId,
  sanitizeThemePresetId,
  shouldApplyCustomThemePresetTokens,
} from "./themePreset";

const baseSettings = {
  theme: "system",
  lightThemePresetId: "vscode-light-modern",
  darkThemePresetId: "vscode-dark-modern",
  customThemePresetId: "vscode-dark-modern",
} as AppSettings;

describe("themePreset", () => {
  it("sanitizes invalid preset ids to appearance defaults", () => {
    expect(sanitizeLightThemePresetId("vscode-dark-modern")).toBe(
      "vscode-light-modern",
    );
    expect(sanitizeDarkThemePresetId("vscode-light-plus")).toBe(
      "vscode-dark-modern",
    );
    expect(sanitizeThemePresetId("invalid")).toBe("vscode-dark-modern");
  });

  it("resolves the active preset from the matching appearance slot", () => {
    expect(resolveThemePresetIdForAppearance(baseSettings, "light")).toBe(
      "vscode-light-modern",
    );
    expect(resolveThemePresetIdForAppearance(baseSettings, "dark")).toBe(
      "vscode-dark-modern",
    );
  });

  it("updates only the active appearance slot when changing presets", () => {
    const nextDarkSettings = buildSettingsWithThemePreset(
      baseSettings,
      "dark",
      "vscode-dark-plus",
    );
    expect(nextDarkSettings.darkThemePresetId).toBe("vscode-dark-plus");
    expect(nextDarkSettings.lightThemePresetId).toBe("vscode-light-modern");

    const nextLightSettings = buildSettingsWithThemePreset(
      baseSettings,
      "light",
      "vscode-light-plus",
    );
    expect(nextLightSettings.lightThemePresetId).toBe("vscode-light-plus");
    expect(nextLightSettings.darkThemePresetId).toBe("vscode-dark-modern");
  });

  it("resolves the custom preset and appearance when theme is custom", () => {
    const settings = {
      ...baseSettings,
      theme: "custom",
      customThemePresetId: "vscode-github-light",
    } as AppSettings;

    expect(resolveCustomThemePresetId(settings)).toBe("vscode-github-light");
    expect(resolveActiveThemePresetId(settings, "dark")).toBe("vscode-github-light");
    expect(resolveEffectiveThemeAppearance(settings, "dark")).toBe("light");
  });

  it("updates only the custom preset when changing custom theme colors", () => {
    const nextSettings = buildSettingsWithCustomThemePreset(
      baseSettings,
      "vscode-one-dark-pro",
    );

    expect(nextSettings.customThemePresetId).toBe("vscode-one-dark-pro");
    expect(nextSettings.lightThemePresetId).toBe("vscode-light-modern");
    expect(nextSettings.darkThemePresetId).toBe("vscode-dark-modern");
  });

  it("only applies preset tokens for the custom theme mode", () => {
    expect(shouldApplyCustomThemePresetTokens("custom")).toBe(true);
    expect(shouldApplyCustomThemePresetTokens("dark")).toBe(false);
    expect(shouldApplyCustomThemePresetTokens("light")).toBe(false);
    expect(shouldApplyCustomThemePresetTokens("system")).toBe(false);
    expect(shouldApplyCustomThemePresetTokens("dim")).toBe(false);
  });

  it("returns all preset options for the custom theme picker", () => {
    expect(getAllThemePresetOptions().map((preset) => preset.id)).toEqual([
      "vscode-light-modern",
      "vscode-light-plus",
      "vscode-github-light",
      "vscode-solarized-light",
      "vscode-dark-modern",
      "vscode-dark-plus",
      "vscode-github-dark",
      "vscode-github-dark-dimmed",
      "vscode-one-dark-pro",
      "vscode-monokai",
      "vscode-solarized-dark",
    ]);
  });
});
