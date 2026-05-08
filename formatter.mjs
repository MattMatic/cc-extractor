/**
 * formatter.mjs
 * Renders aggregated minute-bucket data into plain text or an HTML table.
 */

/**
 * @typedef {Object} MinuteBucket
 * @property {string} timecode
 * @property {number} minute
 * @property {string} text
 */

// ── Plain Text ─────────────────────────────────────────────────────────────

/**
 * Render buckets as aligned plain text.
 * Format:
 *   00:00   Some text here that spans
 *           multiple visual lines...
 *   01:00   Next minute text…
 *
 * @param {MinuteBucket[]} buckets
 * @param {string}         filename   – used for header
 * @returns {string}
 */
export function renderPlainText(buckets, filename = '') {
  const TIMECODE_COL = 8;  // width of timecode + gap
  const WRAP_WIDTH   = 80; // total target width (soft wrap)
  const TEXT_WIDTH   = WRAP_WIDTH - TIMECODE_COL;

  const lines = [];

  // Header
  if (filename) {
    lines.push(`File: ${filename}`);
    lines.push('─'.repeat(WRAP_WIDTH));
  }
  lines.push('');

  for (const bucket of buckets) {
    const words    = bucket.text.split(' ');
    const wrapped  = wrapWords(words, TEXT_WIDTH);

    wrapped.forEach((line, i) => {
      if (i === 0) {
        const tc = bucket.timecode.padEnd(TIMECODE_COL);
        lines.push(`${tc}${line}`);
      } else {
        lines.push(`${' '.repeat(TIMECODE_COL)}${line}`);
      }
    });

    lines.push(''); // blank line between minutes
  }

  return lines.join('\n').trimEnd();
}

/**
 * Word-wrap a list of words into lines of max `width` characters.
 * @param {string[]} words
 * @param {number}   width
 * @returns {string[]}
 */
function wrapWords(words, width) {
  if (words.length === 0) return [''];
  const lines = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── HTML Table ─────────────────────────────────────────────────────────────

/**
 * Render buckets as a self-contained HTML table document.
 * @param {MinuteBucket[]} buckets
 * @param {string}         filename
 * @returns {string}  – full HTML document string
 */
export function renderHtmlTable(buckets, filename = '') {
  const rows = buckets.map(bucket => `
      <tr>
        <td class="tc">${escHtml(bucket.timecode)}</td>
        <td class="tx">${escHtml(bucket.text)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Captions${filename ? ' — ' + escHtml(filename) : ''}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 14px;
      background: #0d0d0d;
      color: #e8e0d0;
      padding: 2rem;
      line-height: 1.7;
    }
    h1 {
      font-size: .9rem;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: #6b6560;
      margin-bottom: 1.5rem;
    }
    table {
      width: 100%;
      max-width: 860px;
      border-collapse: collapse;
    }
    thead th {
      text-align: left;
      font-size: .75rem;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: #f5a623;
      padding: .4rem .75rem;
      border-bottom: 1px solid #2a2a2a;
    }
    td {
      padding: .55rem .75rem;
      border-bottom: 1px solid #1e1e1e;
      vertical-align: top;
    }
    td.tc {
      color: #f5a623;
      white-space: nowrap;
      width: 80px;
      font-weight: 700;
    }
    td.tx { color: #e8e0d0; }
    tr:hover td { background: #1a1a1a; }
    tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  ${filename ? `<h1>${escHtml(filename)}</h1>` : ''}
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Captions</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Build the in-page table DOM (not a full HTML doc) for preview rendering.
 * Returns an HTML string for innerHTML.
 * @param {MinuteBucket[]} buckets
 * @returns {string}
 */
export function renderTableInner(buckets) {
  const rows = buckets.map(bucket => `
      <tr>
        <td>${escHtml(bucket.timecode)}</td>
        <td>${escHtml(bucket.text)}</td>
      </tr>`).join('');

  return `<table>
    <thead>
      <tr><th>Time</th><th>Captions</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>`;
}

/**
 * Escape HTML special characters.
 */
function escHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}
