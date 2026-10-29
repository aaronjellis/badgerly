import { describe, expect, it } from 'vitest';
import { shortcutFor, undoesRemove } from '../src/ui/useShortcuts';

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
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
      expect(press('s', { target })).toBe('save');
      expect(press('e', { target })).toBe('export');
    }
  });
  it('ignores the repeats of a held key', () => {
    expect(press('s', { repeat: true })).toBeNull();
    expect(press('s', { repeat: false })).toBe('save');
  });
});

describe('undoesRemove', () => {
  const key = (k: string, extra: Partial<Parameters<typeof undoesRemove>[0]> = {}) =>
    undoesRemove({ key: k, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...extra });
  it('is ⌘Z or Ctrl+Z', () => {
    expect(key('z')).toBe(true);
    expect(key('Z', { metaKey: false, ctrlKey: true })).toBe(true);
    expect(key('z', { metaKey: false })).toBe(false);
    expect(key('z', { shiftKey: true })).toBe(false);
    expect(key('z', { repeat: true })).toBe(false);
    expect(key('y')).toBe(false);
  });
  it('leaves a text field its own undo', () => {
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
      expect(key('z', { target })).toBe(false);
    }
    expect(key('z', { target: { tagName: 'BUTTON' } })).toBe(true);
  });
});
