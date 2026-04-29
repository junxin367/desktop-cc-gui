import type { ShortcutPlatform } from './undoRedoShortcut.js';

export const IME_SETTLED_GUARD_MS = 100;

interface ComposingEventLike {
  isComposing?: boolean;
  keyCode?: number;
}

interface SpaceKeyEventLike extends ComposingEventLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export function isLinuxImeCompatibilityPlatform(platform: ShortcutPlatform): boolean {
  return platform === 'linux';
}

export function isCompositionRecentlySettled(
  lastCompositionEndTime: number,
  now = Date.now(),
): boolean {
  return now - lastCompositionEndTime < IME_SETTLED_GUARD_MS;
}

export function isImeKeydownStillComposing(
  event: ComposingEventLike,
  isComposing: boolean,
  platform: ShortcutPlatform,
): boolean {
  if (isComposing || event.isComposing === true) {
    return true;
  }

  return isLinuxImeCompatibilityPlatform(platform) && event.keyCode === 229;
}

export function shouldTriggerFileTagRenderOnSpaceKey(
  event: SpaceKeyEventLike,
  options: {
    isComposing: boolean;
    lastCompositionEndTime: number;
    platform: ShortcutPlatform;
    now?: number;
  },
): boolean {
  if (event.key !== ' ') {
    return false;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  if (isImeKeydownStillComposing(event, options.isComposing, options.platform)) {
    return false;
  }

  if (
    isLinuxImeCompatibilityPlatform(options.platform) &&
    isCompositionRecentlySettled(options.lastCompositionEndTime, options.now)
  ) {
    return false;
  }

  return true;
}
