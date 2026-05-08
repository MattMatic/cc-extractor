/**
 * downloader.mjs
 * Utilities for downloading text content as files and copying to clipboard.
 */

/**
 * Trigger a file download in the browser.
 * @param {string} content   – file content
 * @param {string} filename  – suggested filename
 * @param {string} mimeType  – e.g. 'text/plain' or 'text/html'
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  a.href     = url;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Copy a string to the clipboard.
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for non-secure contexts (e.g. served over plain HTTP)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('execCommand copy failed');
  }
}

/**
 * Derive a download filename from the source filename and desired extension.
 * @param {string} sourceFilename   – original file name e.g. "my-video.mp4"
 * @param {string} ext              – target extension e.g. "txt" or "html"
 * @returns {string}
 */
export function deriveFilename(sourceFilename, ext) {
  const base = sourceFilename.replace(/\.[^/.]+$/, ''); // strip extension
  return `${base}_captions.${ext}`;
}
