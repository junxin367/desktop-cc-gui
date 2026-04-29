import type {
  AppSettings,
  DarkThemePresetId,
  LightThemePresetId,
  ThemeAppearance,
  ThemePresetId,
} from "../../../types";
import {
  ALL_THEME_PRESET_IDS,
  DARK_THEME_PRESET_IDS,
  DEFAULT_DARK_THEME_PRESET_ID,
  DEFAULT_LIGHT_THEME_PRESET_ID,
  LIGHT_THEME_PRESET_IDS,
  getVsCodeThemePreset,
} from "../constants/vscodeThemePresets";
import { resolveThemeAppearance } from "./themeAppearance";

const LIGHT_PRESET_ID_SET = new Set<ThemePresetId>(LIGHT_THEME_PRESET_IDS);
const DARK_PRESET_ID_SET = new Set<ThemePresetId>(DARK_THEME_PRESET_IDS);
const ALL_PRESET_ID_SET = new Set<ThemePresetId>(ALL_THEME_PRESET_IDS);

export function sanitizeLightThemePresetId(
  value: string | null | undefined,
): LightThemePresetId {
  return LIGHT_PRESET_ID_SET.has(value as ThemePresetId)
    ? (value as LightThemePresetId)
    : DEFAULT_LIGHT_THEME_PRESET_ID;
}

export function sanitizeDarkThemePresetId(
  value: string | null | undefined,
): DarkThemePresetId {
  return DARK_PRESET_ID_SET.has(value as ThemePresetId)
    ? (value as DarkThemePresetId)
    : DEFAULT_DARK_THEME_PRESET_ID;
}

export function sanitizeThemePresetId(
  value: string | null | undefined,
): ThemePresetId {
  return ALL_PRESET_ID_SET.has(value as ThemePresetId)
    ? (value as ThemePresetId)
    : DEFAULT_DARK_THEME_PRESET_ID;
}

export function resolveThemePresetIdForAppearance(
  settings: Pick<AppSettings, "lightThemePresetId" | "darkThemePresetId">,
  appearance: ThemeAppearance,
): ThemePresetId {
  return appearance === "light"
    ? sanitizeLightThemePresetId(settings.lightThemePresetId)
    : sanitizeDarkThemePresetId(settings.darkThemePresetId);
}

export function resolveCustomThemePresetId(
  settings: Pick<AppSettings, "customThemePresetId">,
): ThemePresetId {
  return sanitizeThemePresetId(settings.customThemePresetId);
}

export function shouldApplyCustomThemePresetTokens(
  theme: AppSettings["theme"],
): boolean {
  return theme === "custom";
}

export function resolveEffectiveThemeAppearance(
  settings: Pick<
    AppSettings,
    "theme" | "lightThemePresetId" | "darkThemePresetId" | "customThemePresetId"
  >,
  systemAppearance: ThemeAppearance,
): ThemeAppearance {
  if (settings.theme === "custom") {
    return getVsCodeThemePreset(resolveCustomThemePresetId(settings)).appearance;
  }
  return resolveThemeAppearance(settings.theme, systemAppearance);
}

export function resolveActiveThemePresetId(
  settings: Pick<
    AppSettings,
    "theme" | "lightThemePresetId" | "darkThemePresetId" | "customThemePresetId"
  >,
  systemAppearance: ThemeAppearance,
): ThemePresetId {
  if (settings.theme === "custom") {
    return resolveCustomThemePresetId(settings);
  }
  return resolveThemePresetIdForAppearance(
    settings,
    resolveThemeAppearance(settings.theme, systemAppearance),
  );
}

export function buildSettingsWithThemePreset(
  settings: AppSettings,
  appearance: ThemeAppearance,
  presetId: ThemePresetId,
): AppSettings {
  if (appearance === "light") {
    return {
      ...settings,
      lightThemePresetId: sanitizeLightThemePresetId(presetId),
    };
  }
  return {
    ...settings,
    darkThemePresetId: sanitizeDarkThemePresetId(presetId),
  };
}

export function buildSettingsWithCustomThemePreset(
  settings: AppSettings,
  presetId: ThemePresetId,
): AppSettings {
  return {
    ...settings,
    customThemePresetId: sanitizeThemePresetId(presetId),
  };
}

export function getAllThemePresetOptions(): readonly ReturnType<
  typeof getVsCodeThemePreset
>[] {
  return ALL_THEME_PRESET_IDS.map((presetId) => getVsCodeThemePreset(presetId));
}
