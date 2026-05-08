/**
 * aggregator.mjs
 * Groups parsed cues into minute-increment buckets and combines
 * the text within each minute into a single entry.
 */

/**
 * @typedef {Object} ParsedCue
 * @property {number} startTime  – seconds
 * @property {number} endTime    – seconds
 * @property {string} text
 */

/**
 * @typedef {Object} MinuteBucket
 * @property {string} timecode   – "MM:SS" display label, always "MM:00"
 * @property {number} minute     – integer minute index (0, 1, 2, …)
 * @property {string} text       – combined text for this minute
 */

/**
 * Aggregate cues into per-minute buckets.
 * A cue belongs to the minute in which it *starts*.
 *
 * @param {ParsedCue[]} cues
 * @returns {MinuteBucket[]}
 */
export function aggregateByMinute(cues) {
  if (!cues || cues.length === 0) return [];

  /** @type {Map<number, string[]>} minute → text fragments */
  const buckets = new Map();

  for (const cue of cues) {
    const minute = Math.floor(cue.startTime / 60);

    if (!buckets.has(minute)) {
      buckets.set(minute, []);
    }
    buckets.get(minute).push(cue.text);
  }

  // Sort by minute and build output
  const sorted = [...buckets.entries()].sort(([a], [b]) => a - b);

  return sorted.map(([minute, fragments]) => ({
    timecode: formatMinuteTimecode(minute),
    minute,
    text: fragments.join(' ').replace(/\s+/g, ' ').trim(),
  }));
}

/**
 * Format a minute index as "HH:MM".
 * @param {number} minute
 * @returns {string}
 */
function formatMinuteTimecode(minute) {
  const hours = Math.floor(minute / 60);
  const mins  = minute % 60;
  const hh    = String(hours).padStart(2, '0');
  const mm    = String(mins).padStart(2, '0');
  return `${hh}:${mm}`;
}
