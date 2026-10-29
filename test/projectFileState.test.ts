import { describe, expect, it } from 'vitest';
import { defaultProject } from '../src/engine/model';
import type { BadgeProject } from '../src/engine/model';
import { initialFileState, isUnsaved, snapshotOf, stepFile } from '../src/state/projectFileState';
import type { FileEvent, FileState } from '../src/state/projectFileState';
import { reduce } from '../src/state/reducer';

const unsaved = (s: FileState) => isUnsaved(s.project, s.saved);
const run = (s: FileState, ...events: FileEvent[]) => events.reduce(stepFile, s);
/** An edit as the editor makes it: the reducer's next project. */
const edit = (s: FileState, patch: Partial<BadgeProject>): FileEvent => ({ type: 'edit', project: reduce(s.project, { type: 'set', patch }) });

describe('unsaved changes', () => {
  it('a fresh default badge is clean', () => {
    expect(unsaved(initialFileState(defaultProject()))).toBe(false);
  });

  it('an edit marks it unsaved, and putting the value back marks it clean again', () => {
    const start = initialFileState(defaultProject());
    const edited = run(start, edit(start, { name: 'Other' }));
    expect(unsaved(edited)).toBe(true);
    expect(unsaved(run(edited, edit(edited, { name: 'Badge' })))).toBe(false);
  });

  it('an edit that changes nothing stays clean', () => {
    const start = initialFileState(defaultProject());
    expect(unsaved(run(start, edit(start, { name: start.project.name })))).toBe(false);
  });

  it('save clears it, and a later edit marks it again', () => {
    const start = initialFileState(defaultProject());
    const edited = run(start, edit(start, { name: 'Other' }));
    const saved = run(edited, { type: 'save' });
    expect(unsaved(saved)).toBe(false);
    expect(unsaved(run(saved, edit(saved, { name: 'Third' })))).toBe(true);
  });

  it('open takes the file as the saved badge, and a later edit marks it unsaved', () => {
    const start = initialFileState(defaultProject());
    const dirty = run(start, edit(start, { name: 'Other' }));
    const opened = run(dirty, { type: 'open', project: { ...defaultProject(), name: 'From file' } });
    expect(opened.project.name).toBe('From file');
    expect(unsaved(opened)).toBe(false);
    expect(unsaved(run(opened, edit(opened, { unit: 'mm' })))).toBe(true);
  });

  it('new resets to a clean default', () => {
    const start = initialFileState(defaultProject());
    const dirty = run(start, edit(start, { name: 'Other' }));
    expect(unsaved(dirty)).toBe(true);
    const fresh = run(dirty, { type: 'new', project: defaultProject() });
    expect(fresh.project.name).toBe('Badge');
    expect(unsaved(fresh)).toBe(false);
  });
});

describe('snapshotOf', () => {
  it('is the same for equal content, whatever made it', () => {
    const p = defaultProject();
    expect(snapshotOf(p)).toBe(snapshotOf(structuredClone(p)));
  });
});
