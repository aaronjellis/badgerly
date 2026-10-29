import { describe, expect, it } from 'vitest';
import { shortcutFor } from '../src/ui/useShortcuts';

const press = (key: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({ key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target: { tagName: 'DIV' }, ...extra });

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
  it('ignores events from fields', () => {
    expect(press('s', { target: { tagName: 'INPUT' } })).toBeNull();
    expect(press('s', { target: { tagName: 'TEXTAREA' } })).toBeNull();
    expect(press('s', { target: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
  });
});
