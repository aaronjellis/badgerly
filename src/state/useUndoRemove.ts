/** One level of undo for removing an element: ⌘Z or Ctrl+Z puts the last removed element back. No other edit is undone. */
import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import type { BadgeElement, BadgeProject } from '../engine/model';
import { undoesRemove } from '../ui/useShortcuts';
import type { Action } from './reducer';

/**
 * Wraps `dispatch` so a removal remembers the element and its place in the list, and listens for the undo
 * chord to put it back and select it. Opening or starting a project forgets it. Returns the wrapped dispatch,
 * which every remove must go through.
 */
export function useUndoRemove(project: BadgeProject, dispatch: Dispatch<Action>, select: (id: string) => void): Dispatch<Action> {
  const lastRemoved = useRef<{ element: BadgeElement; index: number } | null>(null);
  const latest = useRef({ project, dispatch, select });
  latest.current = { project, dispatch, select };

  const wrapped = useCallback<Dispatch<Action>>((action) => {
    const { project: p, dispatch: send } = latest.current;
    if (action.type === 'removeElement') {
      const index = p.elements.findIndex((el) => el.id === action.id);
      if (index >= 0) lastRemoved.current = { element: p.elements[index], index };
    } else if (action.type === 'load') {
      lastRemoved.current = null;
    }
    send(action);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const removed = lastRemoved.current;
      if (!removed || !undoesRemove({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, repeat: e.repeat, target: e.target })) return;
      e.preventDefault();
      lastRemoved.current = null;
      latest.current.dispatch({ type: 'restoreElement', ...removed });
      latest.current.select(removed.element.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return wrapped;
}
