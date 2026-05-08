/**
 * parser.mjs
 * Cleans and normalises raw cue payloads from different caption formats
 * into plain, human-readable text suitable for aggregation.
 *
 * Handles:
 *  - tx3g  : plain UTF-8, may contain style extension boxes (already stripped by extractor)
 *  - wvtt  : WebVTT cue payload (may include VTT markup like <b>, <i>, timestamps)
 *  - stpp  : TTML / SMPTE-TT XML fragment
 */

/**
 * @typedef {Object} RawCue
 * @property {number} startTime
 * @property {number} endTime
 * @property {string} text
 */

/**
 * @typedef {Object} ParsedCue
 * @property {number} startTime
 * @property {number} endTime
 * @property {string} text       – clean plain text, no markup
 */

/**
 * Parse and clean an array of raw cues for a given track kind.
 * @param {RawCue[]} rawCues
 * @param {string}   kind  – 'tx3g' | 'wvtt' | 'stpp'
 * @returns {ParsedCue[]}
 */
export function parseCues(rawCues, kind) {
  return rawCues
    .map(cue => ({
      startTime: cue.startTime,
      endTime:   cue.endTime,
      text:      cleanText(cue.text, kind),
    }))
    .filter(cue => cue.text.length > 0);
}

/**
 * Dispatch cleaning to the appropriate handler.
 */
function cleanText(raw, kind) {
  let text = raw;

  if (kind === 'stpp') {
    text = cleanTtml(text);
  } else if (kind === 'wvtt') {
    text = cleanVtt(text);
  } else {
    // tx3g / generic
    text = cleanTx3g(text);
  }

  return normalise(text);
}

/**
 * tx3g: mostly plain UTF-8; strip any stray control characters
 * and HTML-like markup occasionally written by encoders.
 */
function cleanTx3g(text) {
  return stripHtml(text);
}

/**
 * WebVTT in-cue markup:
 *   <b>, <i>, <u>, <ruby>, <rt>, <lang>, <c.classname>
 *   <00:00:01.000> — embedded timestamps
 */
function cleanVtt(text) {
  // Remove VTT timestamp tags like <00:01:02.345>
  text = text.replace(/<\d{2}:\d{2}:\d{2}\.\d+>/g, '');
  // Remove VTT voice spans <v Speaker>
  text = text.replace(/<v\s[^>]*>/gi, '');
  return stripHtml(text);
}

/**
 * TTML / SMPTE-TT: extract text nodes only from XML fragment.
 */
function cleanTtml(text) {
  // Quick check: is it XML?
  if (!text.includes('<')) return text;

  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(
      `<root xmlns:tt="http://www.w3.org/ns/ttml">${text}</root>`,
      'application/xml'
    );
    // Collect text nodes, join with spaces
    return extractTextNodes(doc.documentElement).join(' ');
  } catch {
    // Fallback: strip tags
    return stripHtml(text);
  }
}

/**
 * Recursively collect non-empty text nodes from a DOM node.
 */
function extractTextNodes(node) {
  const parts = [];
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent.trim();
      if (t) parts.push(t);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      parts.push(...extractTextNodes(child));
    }
  }
  return parts;
}

/**
 * Strip HTML/XML tags and decode common entities.
 */
function stripHtml(text) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi,  '&')
    .replace(/&lt;/gi,   '<')
    .replace(/&gt;/gi,   '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&[a-z]+;/gi, ' ');
}

/**
 * Normalise whitespace: collapse runs, trim, remove blank lines.
 */
function normalise(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g,   '\n')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}
