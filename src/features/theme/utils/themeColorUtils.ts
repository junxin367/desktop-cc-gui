import { normalizeHexColor } from "../../../utils/colorUtils";

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(value: string, fallback: string): RgbColor {
  const normalized = normalizeHexColor(value) || normalizeHexColor(fallback);
  if (!normalized) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${clampColorChannel(r).toString(16).padStart(2, "0")}${clampColorChannel(g)
    .toString(16)
    .padStart(2, "0")}${clampColorChannel(b).toString(16).padStart(2, "0")}`;
}

export function mixHexColors(
  base: string,
  overlay: string,
  overlayRatio: number,
): string {
  const ratio = Math.max(0, Math.min(1, overlayRatio));
  const left = parseHexColor(base, "#000000");
  const right = parseHexColor(overlay, "#000000");
  return rgbToHex({
    r: left.r * (1 - ratio) + right.r * ratio,
    g: left.g * (1 - ratio) + right.g * ratio,
    b: left.b * (1 - ratio) + right.b * ratio,
  });
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex) || "#000000";
  const rgb = parseHexColor(normalized, "#000000");
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
}
