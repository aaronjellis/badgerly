/** Loads Google Fonts into the page, so the stage and the font picker draw them. */

/** Families whose preview faces have been asked for. */
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
async function loadFaces(families: string[], weights: number[]): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.all(families.flatMap((f) => weights.map((w) => document.fonts.load(`${w} 48px "${f}"`))));
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
