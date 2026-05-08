# CC Extractor

Client-side closed caption extractor for MP4 files.  
No file uploads — everything runs in the browser.

> Written with Claude Pro 😊
> 
> **LIVE**: https://mattmatic.github.io/cc-extractor/

## Files

```
cc-extractor/
├── index.html       Shell & layout
├── style.css        Stylesheet
├── main.mjs         UI orchestration (entry point)
├── extractor.mjs    MP4Box demuxing & track detection
├── parser.mjs       Raw cue text cleaning (tx3g / wvtt / stpp)
├── aggregator.mjs   Minute-bucket grouping
├── formatter.mjs    Plain text & HTML table rendering
└── downloader.mjs   Download & clipboard utilities
```

## Serving locally

Because the app uses ES modules (`.mjs` files) and `fetch()` it **must** be
served over HTTP — opening `index.html` directly via `file://` will be blocked
by the browser's CORS policy.

### Python (quickest)

```bash
cd cc-extractor
python3 -m http.server 8080
```
Then open: http://localhost:8080

### Node / npx

```bash
npx serve cc-extractor
```

### VS Code
Install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.

## Supported caption formats

| Format | Description |
|--------|-------------|
| `tx3g` | MPEG-4 Timed Text — most common in QuickTime/MP4 |
| `wvtt` | WebVTT encapsulated in ISOBMFF |
| `stpp` | TTML / SMPTE-TT subtitles |

### CEA-608/708 (embedded)
These captions are multiplexed into the H.264/H.265 video bitstream using
SEI NAL units. Decoding them client-side requires a full bitstream parser not
available in MP4Box.js. If detected, the app will display a warning.
Use **ccextractor** (`ccextractor input.mp4 -o captions.srt`) to extract these
first, then the SRT can be used directly.

## Output

- **Plain text** — monospace-aligned, `MM:00` timecodes, soft-wrapped at 80 chars
- **HTML table** — self-contained dark-themed document with timecode column

Both formats can be copied to clipboard or downloaded.
