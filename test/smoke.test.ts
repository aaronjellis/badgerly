import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
describe('scaffold', () => {
  it('has the Badgerly accent in the tokens', () => {
    const css = readFileSync('src/ui/tokens.css', 'utf8');
    expect(css).toContain('--accent: #a8541a');
    expect(css).not.toContain('#4f7a1b');
  });
});
