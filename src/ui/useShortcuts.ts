import { useEffect, useRef } from 'react';

export type Shortcut = 'save' | 'open' | 'export';

const KEYS: Record<string, Shortcut> = { s: 'save', o: 'open', e: 'export' };
const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}

/** The command a key press asks for: ⌘ or Ctrl with S, O or E, and not while typing in a field. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return null;
  const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target && (target.isContentEditable || TEXT_TAGS.has(target.tagName ?? ''))) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}

/** Runs the handler for ⌘S, ⌘O and ⌘E (Ctrl on other systems), in place of the browser's own. */
export function useShortcuts(handlers: Record<Shortcut, () => void>): void {
  // The latest handlers, so the listener is added once and never runs a stale project.
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = shortcutFor(e);
      if (!shortcut) return;
      e.preventDefault();
      latest.current[shortcut]();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
