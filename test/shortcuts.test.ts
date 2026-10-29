import { describe, expect, it } from 'vitest';
import { shortcutFor } from '../src/ui/useShortcuts';

const press = (key: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({ key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...extra });

describe('shortcutFor', () => {
  it('maps S, O and E with ⌘ or Ctrl', () => {
    expect([press('s'), press('O'), press('e')]).toEqual(['save', 'open', 'export']);
    expect(press('s', { metaKey: false, ctrlKey: true })).toBe('save');
  });
  it('ignores a bare key, other chords, and other keys', () => {
    expect(press('s', { metaKey: false })).toBeNull();
    expect(press('s', { shiftKey: true })).toBeNull();
    expect(press('s', { altKey: true })).toBeNull();
    expect(press('z')).toBeNull();
  });
  it('fires from fields too, since the chords do not type text', () => {
    // The event's target is not part of the decision.
    expect(shortcutFor({ key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBe('save');
  });
  it('ignores the repeats of a held key', () => {
    expect(press('s', { repeat: true })).toBeNull();
    expect(press('s', { repeat: false })).toBe('save');
  });
});
