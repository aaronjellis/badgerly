import { describe, expect, it } from 'vitest';
import { newProject, readUnit, saveUnit, UNIT_KEY } from '../src/state/unitPreference';

function memory(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage;
}

describe('unit preference', () => {
  it('starts a new project in inches when nothing is stored', () => {
    expect(readUnit(memory())).toBeNull();
    expect(newProject(memory()).unit).toBe('in');
  });
  it('remembers the unit under badgerly.unit and starts a new project in it', () => {
    const storage = memory();
    saveUnit('mm', storage);
    expect(storage.getItem(UNIT_KEY)).toBe('mm');
    expect(readUnit(storage)).toBe('mm');
    expect(newProject(storage).unit).toBe('mm');
  });
  it('ignores a stored value that is not a unit, and storage that throws', () => {
    expect(readUnit(memory({ [UNIT_KEY]: 'cm' }))).toBeNull();
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(readUnit(blocked)).toBeNull();
    expect(() => saveUnit('in', blocked)).not.toThrow();
    expect(newProject(blocked).unit).toBe('in');
  });
});
