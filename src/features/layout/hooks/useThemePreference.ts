import { useEffect } from "react";
import type { AppSettings } from "../../../types";
import {
  DEFAULT_DARK_THEME_PRESET_ID,
  getVsCodeThemePreset,
} from "../../theme/constants/vscodeThemePresets";
import { mapVsCodeColorsToTokens } from "../../theme/utils/mapVsCodeColorsToTokens";
import {
  resolveActiveThemePresetId,
  resolveEffectiveThemeAppearance,
  shouldApplyCustomThemePresetTokens,
} from "../../theme/utils/themePreset";

const THEME_PRESET_CSS_VARIABLE_KEYS = Object.keys(
  mapVsCodeColorsToTokens(getVsCodeThemePreset(DEFAULT_DARK_THEME_PRESET_ID)),
);

function getThemeCssVariableTargets(): HTMLElement[] {
  if (typeof document === "undefined") {
    return [];
  }
  return [
    document.documentElement,
    ...(Array.from(document.querySelectorAll(".app")) as HTMLElement[]),
  ];
}

function applyThemeCssVariables(variableMap: Record<string, string>) {
  for (const target of getThemeCssVariableTargets()) {
    for (const [key, value] of Object.entries(variableMap)) {
      target.style.setProperty(key, value);
    }
  }
}

function clearThemeCssVariables() {
  for (const target of getThemeCssVariableTargets()) {
    for (const key of THEME_PRESET_CSS_VARIABLE_KEYS) {
      target.style.removeProperty(key);
    }
  }
}

type ThemePreferenceSettings = Pick<
  AppSettings,
  "theme" | "lightThemePresetId" | "darkThemePresetId" | "customThemePresetId"
>;

export function useThemePreference(settings: ThemePreferenceSettings) {
  const theme = settings.theme;
  const lightThemePresetId = settings.lightThemePresetId;
  const darkThemePresetId = settings.darkThemePresetId;
  const customThemePresetId = settings.customThemePresetId;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    const media =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    const applyThemeState = () => {
      const systemAppearance = media?.matches ? "dark" : "light";
      const appearance = resolveEffectiveThemeAppearance(
        { theme, lightThemePresetId, darkThemePresetId, customThemePresetId },
        systemAppearance,
      );
      if (theme === "system") {
        delete root.dataset.theme;
      } else {
        root.dataset.theme = theme === "custom" ? appearance : theme;
      }

      if (!shouldApplyCustomThemePresetTokens(theme)) {
        delete root.dataset.themePreset;
        delete root.dataset.themePresetAppearance;
        clearThemeCssVariables();
        return;
      }

      const presetId = resolveActiveThemePresetId(
        { theme, lightThemePresetId, darkThemePresetId, customThemePresetId },
        systemAppearance,
      );
      const preset = getVsCodeThemePreset(presetId);
      root.dataset.themePreset = preset.id;
      root.dataset.themePresetAppearance = appearance;
      applyThemeCssVariables(mapVsCodeColorsToTokens(preset));
    };

    applyThemeState();

    if (!media) {
      return;
    }
    const handleChange = () => {
      applyThemeState();
    };
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [
    customThemePresetId,
    darkThemePresetId,
    lightThemePresetId,
    theme,
  ]);
}
