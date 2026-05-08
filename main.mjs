/**
 * main.mjs
 * App entry point — wires up the UI, drag-and-drop, file input,
 * and orchestrates extraction → parsing → aggregation → display.
 */

import { extractCaptionTracks } from './extractor.mjs';
import { parseCues }            from './parser.mjs';
import { aggregateByMinute }    from './aggregator.mjs';
import { renderPlainText, renderHtmlTable, renderTableInner } from './formatter.mjs';
import { downloadFile, copyToClipboard, deriveFilename }      from './downloader.mjs';

// ── DOM refs ───────────────────────────────────────────────────────────────

const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const statusArea    = document.getElementById('status-area');
const statusIcon    = document.getElementById('status-icon');
const statusText    = document.getElementById('status-text');
const progressFill  = document.getElementById('progress-fill');
const trackSelector = document.getElementById('track-selector');
const trackSelect   = document.getElementById('track-select');
const resultsEl     = document.getElementById('results');
const fileLabel     = document.getElementById('file-label');
const cueCount      = document.getElementById('cue-count');
const outputText    = document.getElementById('output-text');
const outputTableWr = document.getElementById('output-table-wrap');
const btnText       = document.getElementById('btn-text');
const btnTable      = document.getElementById('btn-table');
const btnCopy       = document.getElementById('btn-copy');
const btnDlTxt      = document.getElementById('btn-download-txt');
const btnDlHtml     = document.getElementById('btn-download-html');
const btnReset      = document.getElementById('btn-reset');
const warningBanner = document.getElementById('warning-banner');

// ── App State ──────────────────────────────────────────────────────────────

const state = {
  filename:   '',
  tracks:     [],      // CaptionTrack[]
  buckets:    [],      // MinuteBucket[] for active track
  plainText:  '',
  htmlDoc:    '',
  activeTrack: null,
  fmt:        'text',  // 'text' | 'table'
};

// ── Drag & Drop ────────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

['dragleave', 'dragend'].forEach(evt =>
  dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover'))
);

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// ── Track Selector ─────────────────────────────────────────────────────────

trackSelect.addEventListener('change', () => {
  const id = parseInt(trackSelect.value, 10);
  const track = state.tracks.find(t => t.id === id);
  if (track) buildOutput(track);
});

// ── Format Toggle ──────────────────────────────────────────────────────────

btnText.addEventListener('click',  () => setFormat('text'));
btnTable.addEventListener('click', () => setFormat('table'));

function setFormat(fmt) {
  state.fmt = fmt;
  btnText.classList.toggle('active',  fmt === 'text');
  btnTable.classList.toggle('active', fmt === 'table');
  outputText.classList.toggle('hidden',    fmt !== 'text');
  outputTableWr.classList.toggle('hidden', fmt !== 'table');
}

// ── Action Buttons ─────────────────────────────────────────────────────────

btnCopy.addEventListener('click', async () => {
  const content = state.fmt === 'text' ? state.plainText : state.htmlDoc;
  try {
    await copyToClipboard(content);
    btnCopy.classList.add('copied');
    btnCopy.textContent = '✓ Copied!';
    setTimeout(() => {
      btnCopy.classList.remove('copied');
      btnCopy.innerHTML = `<svg viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.5"/></svg> Copy to Clipboard`;
    }, 2000);
  } catch (err) {
    showWarning(`Clipboard copy failed: ${err.message}`);
  }
});

btnDlTxt.addEventListener('click', () => {
  downloadFile(state.plainText, deriveFilename(state.filename, 'txt'), 'text/plain');
});

btnDlHtml.addEventListener('click', () => {
  downloadFile(state.htmlDoc, deriveFilename(state.filename, 'html'), 'text/html');
});

btnReset.addEventListener('click', reset);

// ── Core Flow ──────────────────────────────────────────────────────────────

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.mp4') && file.type !== 'video/mp4') {
    showWarning('Please select an MP4 file (.mp4).');
    return;
  }

  reset(false);

  state.filename = file.name;

  // Show status
  dropZone.classList.add('hidden');
  show(statusArea);
  setStatus('Parsing MP4 structure…', 'spin');
  setProgress(5);

  try {
    const { tracks, warnings } = await extractCaptionTracks(file, (pct) => {
      setProgress(pct);
      if (pct < 30)       setStatus('Reading file…');
      else if (pct < 60)  setStatus('Demuxing tracks…');
      else if (pct < 90)  setStatus('Extracting samples…');
      else                setStatus('Finalising…');
    });

    if (warnings.length > 0) {
      showWarning(warnings.join('\n\n'));
    }

    state.tracks = tracks;

    if (tracks.length === 0) {
      setStatus('No caption tracks found.', 'error');
      return;
    }

    // Populate track selector if multiple tracks
    if (tracks.length > 1) {
      trackSelect.innerHTML = tracks.map(t =>
        `<option value="${t.id}">${t.label} (${t.language}) [${t.kind}]</option>`
      ).join('');
      show(trackSelector);
    }

    setStatus(`Found ${tracks.length} caption track${tracks.length > 1 ? 's' : ''}.`, 'done');
    buildOutput(tracks[0]);

  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    showWarning(`Processing failed: ${err.message}`);
    console.error(err);
  }
}

/**
 * Build the output for a given track.
 */
function buildOutput(track) {
  state.activeTrack = track;

  const parsed  = parseCues(track.cues, track.kind);
  const buckets = aggregateByMinute(parsed);
  state.buckets = buckets;

  if (buckets.length === 0) {
    setStatus('Track found but contains no readable text.', 'error');
    showWarning(
      'The caption track was detected but produced no readable text. ' +
      'The captions may be empty, use a custom encoding, or contain only bitmap data.'
    );
    return;
  }

  // Render both formats
  state.plainText = renderPlainText(buckets, state.filename);
  state.htmlDoc   = renderHtmlTable(buckets, state.filename);

  // Update in-page views
  outputText.textContent = state.plainText;
  outputTableWr.innerHTML = renderTableInner(buckets);

  // Update toolbar info
  fileLabel.textContent = state.filename;
  cueCount.textContent  = `${buckets.length} min · ${parsed.length} cues`;

  // Show results
  hide(statusArea);
  show(resultsEl);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function reset(showDrop = true) {
  state.filename    = '';
  state.tracks      = [];
  state.buckets     = [];
  state.plainText   = '';
  state.htmlDoc     = '';
  state.activeTrack = null;
  state.fmt         = 'text';

  hide(statusArea);
  hide(resultsEl);
  hide(trackSelector);
  hide(warningBanner);

  outputText.textContent  = '';
  outputTableWr.innerHTML = '';
  trackSelect.innerHTML   = '';
  progressFill.style.width = '0%';

  fileInput.value = '';
  setFormat('text');

  if (showDrop) show(dropZone);
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setProgress(pct) {
  progressFill.style.width = `${Math.min(100, pct)}%`;
}

function setStatus(msg, iconState = 'spin') {
  statusText.textContent = msg;
  statusIcon.className   = 'status-icon';
  if (iconState === 'done')  statusIcon.classList.add('done');
  if (iconState === 'error') statusIcon.classList.add('error');
}

function showWarning(msg) {
  warningBanner.textContent = msg;
  show(warningBanner);
}
