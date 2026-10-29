import { describe, expect, it } from 'vitest';
import { defaultProject } from '../src/engine/model';
import type { BadgeProject } from '../src/engine/model';
import type { ReliefResult } from '../src/engine/relief';
import type { ResolvedBadge, Warning } from '../src/engine/resolve';
import { DASHED_NOTE, reliefNotes } from '../src/ui/sections/reliefNotes';

const resolvedWith = (warnings: Warning[]) => ({ warnings }) as unknown as ResolvedBadge;
const reliefWith = (warnings: Warning[]) =>
  ({ plate: { positions: [] }, parts: null, clamped: { edgeMm: null, debossMm: null, recessMm: null }, warnings }) as ReliefResult;

const dashedSplit = (): BadgeProject => {
  const p = defaultProject();
  return { ...p, border: { ...p.border, style: 'dashed', relief: 'emboss' }, relief: { ...p.relief, split: true } };
};

describe('reliefNotes', () => {
  it('is empty with nothing to report', () => {
    expect(reliefNotes(defaultProject(), resolvedWith([]), reliefWith([]))).toEqual([]);
    expect(reliefNotes(defaultProject(), resolvedWith([]), null)).toEqual([]);
  });

  it('keeps only the relief codes, from the resolve and the relief', () => {
    const project = defaultProject();
    const notes = reliefNotes(
      project,
      resolvedWith([
        { code: 'outsideFlat', elementId: 'a', message: 'Text runs onto the badge\'s edge. Move it inward.' },
        { code: 'missingFont', elementId: 'a', message: 'No font.' },
        { code: 'borderTooDeep', message: 'Too deep.' },
      ]),
      reliefWith([{ code: 'outsideFlat', message: "The border runs onto the badge's edge. Move it inward." }])
    );
    expect(notes).toEqual(["Text runs onto the badge's edge. Move it inward.", "The border runs onto the badge's edge. Move it inward."]);
  });

  it('names the element a thin feature belongs to', () => {
    const project = defaultProject();
    const id = project.elements[0].id;
    const notes = reliefNotes(
      project,
      resolvedWith([]),
      reliefWith([
        { code: 'thin', elementId: id, message: 'Part of this element is thinner than 0.5 mm and may not print.' },
        { code: 'thin', message: 'The border is thinner than 0.5 mm and may not print.' },
      ])
    );
    expect(notes).toEqual([
      'Text: Part of this element is thinner than 0.5 mm and may not print.',
      'The border is thinner than 0.5 mm and may not print.',
    ]);
  });

  it('drops a repeated note', () => {
    const w: Warning = { code: 'thin', message: 'The border is thinner than 0.5 mm and may not print.' };
    expect(reliefNotes(defaultProject(), resolvedWith([]), reliefWith([w, w]))).toHaveLength(1);
  });

  it('adds the many-parts note for a dashed raised border in a split', () => {
    expect(reliefNotes(dashedSplit(), resolvedWith([]), reliefWith([]))).toEqual([DASHED_NOTE]);
    expect(DASHED_NOTE).toBe('A dashed raised border becomes many small parts in a split export.');
  });

  it('leaves the many-parts note out without a split, a dashed style, or a raised line', () => {
    const p = dashedSplit();
    expect(reliefNotes({ ...p, relief: { ...p.relief, split: false } }, resolvedWith([]), null)).toEqual([]);
    expect(reliefNotes({ ...p, border: { ...p.border, style: 'single' } }, resolvedWith([]), null)).toEqual([]);
    expect(reliefNotes({ ...p, border: { ...p.border, relief: 'deboss' } }, resolvedWith([]), null)).toEqual([]);
  });
});
