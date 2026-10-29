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
}

/** The command a key press asks for: ⌘ or Ctrl with S, O or E, from anywhere (none types text), and not a held key's repeats. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.repeat) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}

/** Runs the handler for ⌘S, ⌘O and ⌘E (Ctrl on other systems), in place of the browser's own. */
export function useShortcuts(handlers: Record<Shortcut, () => void>): void {
  // The latest handlers, so the listener is added once and never runs a stale project.
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A held chord still belongs to the app, so the browser's own never opens; only the first press runs.
      const shortcut = shortcutFor({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey });
      if (!shortcut) return;
      e.preventDefault();
      if (!e.repeat) latest.current[shortcut]();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
