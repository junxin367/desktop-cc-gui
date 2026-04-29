import type { ThemeAppearance, ThemePreference } from "../../../types";

type ThemePreferenceLike = ThemePreference | null | undefined;

export function getSystemResolvedThemeAppearance(): ThemeAppearance {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveThemeAppearance(
  theme: ThemePreferenceLike,
  systemAppearance: ThemeAppearance = getSystemResolvedThemeAppearance(),
): ThemeAppearance {
  if (theme === "light") {
    return "light";
  }
  if (theme === "dark" || theme === "dim") {
    return "dark";
  }
  return systemAppearance;
}

export function readDocumentThemeAppearance(): ThemeAppearance {
  if (typeof document === "undefined") {
    return "dark";
  }
  const dataTheme = document.documentElement.dataset.theme as ThemePreferenceLike;
  return resolveThemeAppearance(dataTheme);
}

export function mapAppearanceToMermaidTheme(
  appearance: ThemeAppearance,
): "default" | "dark" {
  return appearance === "light" ? "default" : "dark";
}

export function isThemeMutationAttribute(attributeName: string | null): boolean {
  return attributeName === "data-theme" || attributeName === "data-theme-preset";
}
