import { useEffect, useRef } from 'react';

export type Shortcut = 'save' | 'open' | 'export';

const KEYS: Record<string, Shortcut> = { s: 'save', o: 'open', e: 'export' };

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  /** Where the key went. It does not matter: the chords fire from fields too. */
  target?: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}

/** The command a key press asks for: ⌘ or Ctrl with S, O or E, from anywhere (none types text), and not a held key's repeats. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.repeat) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}

/** A field where ⌘Z undoes typing, which the browser keeps. */
function isTextField(target: KeyLike['target']): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  return el.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? '');
}

/** Whether a key press asks to put back the last removed element: ⌘Z or Ctrl+Z, not in a text field, not a repeat. */
export function undoesRemove(e: KeyLike): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && !e.repeat && e.key.toLowerCase() === 'z' && !isTextField(e.target);
}

/** Runs the handler for ⌘S, ⌘O and ⌘E (Ctrl on other systems), in place of the browser's own. */
export function useShortcuts(handlers: Record<Shortcut, () => void>): void {
  // The latest handlers, so the listener is added once and never runs a stale project.
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A held chord still belongs to the app, so the browser's own never opens; only the first press runs.
      const shortcut = shortcutFor({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, target: e.target });
      if (!shortcut) return;
      e.preventDefault();
      if (!e.repeat) latest.current[shortcut]();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
