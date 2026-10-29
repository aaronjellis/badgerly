/** Real fixture fonts and a font provider that always has them, for tests that resolve badges. */
import { harfbuzzFont } from '../../src/engine/hbFont';
import type { FontProvider } from '../../src/engine/fontProvider';
import type { TextFont } from '../../src/engine/textOutline';

// Real Google Fonts, as Fontsource serves them (latin subset TTFs, OFL-licensed).
const files = import.meta.glob('../fixtures/fonts/*.ttf', { query: '?inline', import: 'default', eager: true }) as Record<
  string,
  string
>;
const fontCache = new Map<string, TextFont>();

/** The fixture font `test/fixtures/fonts/<name>.ttf`, loaded once. */
export function font(name: string): TextFont {
  let f = fontCache.get(name);
  if (!f) {
    const b64 = files[`../fixtures/fonts/${name}.ttf`].split(',')[1];
    f = harfbuzzFont(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    fontCache.set(name, f);
  }
  return f;
}

/** A provider whose `get` always returns `fonts` (null means the fonts are still loading). */
export function fakeProvider(fonts: TextFont[] | null): FontProvider {
  return {
    get: () => fonts,
    load: async () => fonts,
    onChange: () => () => {},
  };
}
