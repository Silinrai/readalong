import { describe, expect, it } from 'vitest';
import { shouldHoldPose } from '@/readalong/foldPose';

describe('shouldHoldPose (S-4)', () => {
  it('holds the pose for a keyboard (height-only) resize while typing', () => {
    expect(shouldHoldPose({ editing: true, lastWidth: 840, width: 840 })).toBe(true);
  });
  it('follows a fold (width change) even while a text field has focus', () => {
    expect(shouldHoldPose({ editing: true, lastWidth: 840, width: 400 })).toBe(false);
  });
  it('follows any resize when not typing', () => {
    expect(shouldHoldPose({ editing: false, lastWidth: 840, width: 840 })).toBe(false);
  });
});
