import { describe, expect, it } from 'vitest';
import {
  IME_SETTLED_GUARD_MS,
  isCompositionRecentlySettled,
  isImeKeydownStillComposing,
  isLinuxImeCompatibilityPlatform,
  shouldTriggerFileTagRenderOnSpaceKey,
} from './imeCompatibility.js';

describe('imeCompatibility', () => {
  it('detects linux-only compatibility platform', () => {
    expect(isLinuxImeCompatibilityPlatform('linux')).toBe(true);
    expect(isLinuxImeCompatibilityPlatform('mac')).toBe(false);
    expect(isLinuxImeCompatibilityPlatform('windows')).toBe(false);
  });

  it('treats recent composition end as settled guard window', () => {
    expect(isCompositionRecentlySettled(1000, 1000 + IME_SETTLED_GUARD_MS - 1)).toBe(true);
    expect(isCompositionRecentlySettled(1000, 1000 + IME_SETTLED_GUARD_MS + 1)).toBe(false);
  });

  it('treats linux keyCode 229 as composing signal', () => {
    expect(
      isImeKeydownStillComposing({ keyCode: 229 }, false, 'linux'),
    ).toBe(true);
    expect(
      isImeKeydownStillComposing({ keyCode: 229 }, false, 'windows'),
    ).toBe(false);
  });

  it('does not trigger file-tag render for linux ctrl+space input-method toggle', () => {
    expect(
      shouldTriggerFileTagRenderOnSpaceKey(
        { key: ' ', ctrlKey: true },
        {
          isComposing: false,
          lastCompositionEndTime: 0,
          platform: 'linux',
        },
      ),
    ).toBe(false);
  });

  it('does not trigger file-tag render immediately after linux composition end', () => {
    expect(
      shouldTriggerFileTagRenderOnSpaceKey(
        { key: ' ' },
        {
          isComposing: false,
          lastCompositionEndTime: 500,
          platform: 'linux',
          now: 500 + IME_SETTLED_GUARD_MS - 1,
        },
      ),
    ).toBe(false);
  });

  it('still triggers file-tag render for normal non-linux space typing', () => {
    expect(
      shouldTriggerFileTagRenderOnSpaceKey(
        { key: ' ' },
        {
          isComposing: false,
          lastCompositionEndTime: 0,
          platform: 'windows',
        },
      ),
    ).toBe(true);
  });
});
