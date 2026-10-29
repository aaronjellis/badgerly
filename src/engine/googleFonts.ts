/** Loads Google Fonts into the page, so the stage and the font picker draw them. */

const loadedFamilies = new Set<string>();
/** Each family's stylesheet request, settled once its `@font-face` rules are in the document. */
const stylesheetLoads = new Map<string, Promise<void>>();
const previewFamilies = new Set<string>();

const encodeFamily = (family: string) => encodeURIComponent(family).replace(/%20/g, '+');

function stylesheetLoaded(link: HTMLLinkElement): Promise<void> {
  if (link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
}

/** Loads the 400 and 700 faces of each family; offline or missing fonts are ignored. */
async function loadFaces(families: string[], weights: number[], italic = ''): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.all(families.flatMap((f) => weights.map((w) => document.fonts.load(`${italic}${w} 48px "${f}"`))));
  } catch {
    // Ignore network/offline errors; the fallback system font still renders cleanly.
  }
}

/**
 * Injects one stylesheet with the 400 and 700 faces of every family not requested before, for the
 * picker's previews. Resolves once the rules are in the document and the faces have loaded.
 */
export async function loadPreviewCss(families: string[]): Promise<void> {
  if (typeof document === 'undefined') return;
  const fresh = [...new Set(families.map((f) => f.trim()).filter((f) => f && !previewFamilies.has(f)))];
  if (fresh.length === 0) return;
  fresh.forEach((f) => previewFamilies.add(f));

  const query = fresh.map((f) => `family=${encodeFamily(f)}:wght@400;700`).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  document.head.appendChild(link);
  await stylesheetLoaded(link);
  await loadFaces(fresh, [400, 700]);
}

/**
 * Dynamically injects a Google Fonts stylesheet for `family` and awaits browser font readiness.
 * The stylesheet has to arrive first: until its `@font-face` rules exist, `document.fonts.load`
 * finds nothing to load and resolves at once, and a canvas drawn then bakes in the fallback font.
 */
export async function loadGoogleFont(family: string, weight: number, style: 'normal' | 'italic'): Promise<void> {
  const clean = family.trim();
  if (!clean || typeof document === 'undefined') return;

  if (!loadedFamilies.has(clean)) {
    loadedFamilies.add(clean);
    const encoded = encodeFamily(clean);
    const linkId = `gfont-${encoded.toLowerCase()}`;
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap`;
      document.head.appendChild(link);
    }
    stylesheetLoads.set(clean, stylesheetLoaded(link));
  }
  await stylesheetLoads.get(clean);

  await loadFaces([clean], [...new Set([400, 700, weight])], style === 'italic' ? 'italic ' : '');
}
