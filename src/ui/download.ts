/** How long the object URL lives after the click, in ms. */
const REVOKE_DELAY_MS = 1000;

/** Saves a blob to the user's disk under the given filename. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked later: some browsers start the download after `click()` returns, and a revoked URL would fail it.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
