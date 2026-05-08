/**
 * extractor.mjs
 * Detects and extracts caption tracks from an MP4 file using MP4Box.js.
 * Supports: tx3g (MPEG-4 Timed Text), wvtt (WebVTT in ISOBMFF), stpp (TTML/SMPTE-TT).
 * Returns raw cue data per track for downstream parsing.
 */

/** Caption track types we can handle */
const CAPTION_HANDLERS = {
  'tx3g': 'tx3g',   // MPEG-4 Timed Text
  'wvtt': 'wvtt',   // WebVTT in ISOBMFF
  'stpp': 'stpp',   // TTML / SMPTE-TT
  'text': 'tx3g',   // some encoders use generic 'text'
  'subt': 'tx3g',   // subtitle hint track
};

/** Tracks that require a bitstream decoder we can't run client-side */
const UNSUPPORTED_TYPES = ['c608', 'c708'];

/**
 * @typedef {Object} RawCue
 * @property {number} startTime  – seconds
 * @property {number} endTime    – seconds
 * @property {string} text       – raw text/markup payload
 */

/**
 * @typedef {Object} CaptionTrack
 * @property {number}   id
 * @property {string}   label
 * @property {string}   language
 * @property {string}   kind       – one of CAPTION_HANDLERS keys
 * @property {RawCue[]} cues
 */

/**
 * Extract all caption tracks from an MP4 File object.
 * @param {File} file
 * @param {function(number):void} [onProgress]  – called with 0–100
 * @returns {Promise<{ tracks: CaptionTrack[], warnings: string[] }>}
 */
export async function extractCaptionTracks(file, onProgress = () => {}) {
  if (typeof MP4Box === 'undefined') {
    throw new Error('MP4Box library not loaded.');
  }

  const mp4 = MP4Box.createFile();
  const warnings = [];

  /** track id → track metadata */
  const trackMeta = {};
  /** track id → accumulated sample arrays */
  const trackSamples = {};
  /** track ids we're extracting */
  const captionTrackIds = [];

  // ── Step 1: wire up onReady as a Promise so we can await it ───────────
  // This ensures mp4.start() is never called before onReady fires, and
  // mp4.flush() is never called before mp4.start() — the two race conditions
  // that caused onFlush to silently never fire.
  const ready = new Promise((resolve, reject) => {
    mp4.onReady = (info) => resolve(info);
    mp4.onError = (err) => reject(new Error(`MP4Box error: ${err}`));
  });

  // ── Step 2: stream the full file into MP4Box ───────────────────────────
  await readFileInChunks(file, mp4, onProgress);
  onProgress(70);

  // ── Step 3: wait for the moov box to be parsed ────────────────────────
  const info = await ready;
  onProgress(75);

  // ── Step 4: configure extraction for caption tracks ───────────────────
  const unsupportedFound = [];

  for (const track of info.tracks) {
    const codec = (track.codec || '').toLowerCase().slice(0, 4);
    const type  = (track.type  || '').toLowerCase();

    if (UNSUPPORTED_TYPES.includes(codec) || UNSUPPORTED_TYPES.includes(type)) {
      unsupportedFound.push(codec || type);
      continue;
    }

    const kind = CAPTION_HANDLERS[codec] || CAPTION_HANDLERS[type];
    if (!kind) continue;

    const label = track.name || track.language || `Track ${track.id}`;

    trackMeta[track.id] = {
      id:        track.id,
      label,
      language:  track.language || 'und',
      kind,
      timescale: track.timescale || 1000,
    };
    trackSamples[track.id] = [];
    captionTrackIds.push(track.id);

    mp4.setExtractionOptions(track.id, null, { nbSamples: Infinity });
  }

  if (unsupportedFound.length > 0) {
    warnings.push(
      `CEA-608/708 embedded captions detected (codec: ${[...new Set(unsupportedFound)].join(', ')}). ` +
      `These are encoded in the video bitstream and cannot be decoded client-side without a specialised library. ` +
      `Consider using a tool like ccextractor to export them first.`
    );
  }

  if (captionTrackIds.length === 0 && unsupportedFound.length === 0) {
    warnings.push(
      'No caption tracks found in this file. ' +
      'The file may not have embedded captions, or they may use an unsupported format.'
    );
  }

  // ── Step 5: start + flush — onSamples fires synchronously here ────────
  mp4.onSamples = (trackId, _user, samples) => {
    if (trackSamples[trackId]) {
      trackSamples[trackId].push(...samples);
    }
  };

  mp4.start();
  mp4.flush();
  onProgress(90);

  // ── Step 6: build output ──────────────────────────────────────────────
  const tracks = [];

  for (const id of captionTrackIds) {
    const meta    = trackMeta[id];
    const samples = trackSamples[id] || [];
    const cues    = samplesToRawCues(samples, meta.timescale, meta.kind);

    tracks.push({
      id:       meta.id,
      label:    meta.label,
      language: meta.language,
      kind:     meta.kind,
      cues,
    });
  }

  onProgress(100);
  return { tracks, warnings };
}

/**
 * Read file and feed to MP4Box in 4 MB chunks.
 */
async function readFileInChunks(file, mp4, onProgress) {
  const CHUNK = 4 * 1024 * 1024;
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK);
    const buf   = await slice.arrayBuffer();
    buf.fileStart = offset;
    mp4.appendBuffer(buf);
    offset += buf.byteLength;

    const pct = 15 + Math.round((offset / file.size) * 55);
    onProgress(Math.min(pct, 70));
  }

  mp4.flush();
}

/**
 * Convert raw MP4Box samples to RawCue objects.
 * @param {Object[]} samples
 * @param {number}   timescale
 * @param {string}   kind
 * @returns {RawCue[]}
 */
function samplesToRawCues(samples, timescale, kind) {
  const cues = [];

  for (const s of samples) {
    if (!s.data || s.data.length === 0) continue;

    const startTime = s.cts  / timescale;
    const endTime   = (s.cts + s.duration) / timescale;
    const text      = decodeSample(s.data, kind);

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return cues;
}

/**
 * Decode a raw sample buffer into a text string.
 */
function decodeSample(data, kind) {
  try {
    if (kind === 'tx3g') {
      return decodeTx3g(data);
    }
    // wvtt and stpp are UTF-8 text/XML payloads
    return new TextDecoder('utf-8').decode(data).trim();
  } catch {
    return '';
  }
}

/**
 * Decode MPEG-4 Timed Text (tx3g) sample.
 * Format: 2-byte big-endian length prefix, then UTF-8 string.
 */
function decodeTx3g(data) {
  if (data.length < 2) return '';
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len  = view.getUint16(0, false);           // big-endian
  if (len === 0 || len > data.length - 2) return '';
  const textBytes = data.slice(2, 2 + len);
  return new TextDecoder('utf-8').decode(textBytes).trim();
}
