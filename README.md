# adhikari-ashutosh.github.io

The personal homepage of Ashutosh Adhikari: https://adhikari-ashutosh.github.io

Designed, written and built by Ashutosh Adhikari.

## What's on it

- **A live spectrogram.** The page computes the features most speech
  recognition models are trained on, in the browser, with NVIDIA NeMo's
  defaults: 16 kHz audio, 25 ms Hann windows every 10 ms, a 512-point FFT
  and 80 Slaney mel bands. It adds pitch from normalised cross-correlation
  and formants from an LPC envelope, and draws it all Praat-style. It loops
  a passage from President Kennedy's 1962 Rice University speech, with word
  and phone tiers aligned to it. You can pause it, unmute it, or switch it
  to your microphone; the audio never leaves the page.
- **The name, drawn in WebGL** under a lens that follows the pointer.
- **160 two-colour themes.** Search and preview them live from the Themes
  button.
- **A globe of visitors.** A small globe at the foot of the page turns
  slowly and pins the countries visits have come from, counted with
  GoatCounter and fetched once a day by a GitHub Action.
- **A stack of sheets.** Each section slides over the last and leaves its
  tab showing, on any screen size.

Plain HTML, CSS and JavaScript: no framework and no build step. Visits are
counted with [GoatCounter](https://www.goatcounter.com), without cookies;
its script is served from this repository.

## Layout

```
index.html                the page
404.html                  the not-found page
css/site.css              all of the styles
js/site.js                sheet stack, clock, theme button, link outlines
js/spectrogram.js         the plot, its tiers and readout, sound and microphone
js/dsp.js                 the analysis: log-mel features, pitch, formants, resampling
js/analyser.js            a worker that runs the analysis off the main thread
js/capture.js             AudioWorklet that hands microphone samples to the worker
js/name.js                the name in WebGL
js/palette.js             the theme palette and its themes
js/count.js               GoatCounter's visit counter
js/globe.js               the visitor globe in the footer
js/globe-data.js          its country outlines and label points
tools/globe-data.py       writes js/globe-data.js
.github/workflows/        the daily job that fetches visitor counts
audio/                    the speech clip (FLAC) and its word and phone timings
ashutosh-adhikari-cv.pdf  the CV
fonts/                    Bricolage Grotesque
```

## Running it locally

There is nothing to install. Serve the folder and open it:

```
python3 -m http.server
```

then visit http://localhost:8000. The microphone needs `localhost` or HTTPS.

## Third-party material

These keep their own licenses:

- `fonts/bricolage-grotesque.woff2`: Bricolage Grotesque, SIL Open Font
  License 1.1 (`fonts/OFL.txt`).
- `audio/rice.flac`: the passage from "We choose to go to the Moon in this
  decade" to "and the others, too" in President John F. Kennedy's address
  at Rice University, Houston, 12 September 1962. The recording was made by
  the White House Communications Agency and is in the public domain (JFK
  Library, JFKWHA-127-002); this copy is from Wikimedia Commons
  (`File:Jfk_rice_university_we_choose_to_go_to_the_moon.ogg`).
- `audio/rice.json`: word and phone timings for that passage, with phones in
  IPA. Words and pauses come from a CTC forced alignment with NVIDIA NeMo's
  `stt_en_conformer_ctc_medium` (CC BY 4.0, run from the sherpa-onnx ONNX
  export). Phones within each phrase come from CMU PocketSphinx (BSD
  license) and its US English model.
- `js/count.js`: GoatCounter's counting script, ISC license.
- `js/globe-data.js`: country outlines from
  [world-atlas](https://github.com/topojson/world-atlas) (ISC license) and
  label points from [Natural Earth](https://www.naturalearthdata.com), whose
  data is in the public domain.
- The theme palettes in `js/palette.js` are reduced to two colours from the
  community themes in [Monkeytype](https://github.com/monkeytypegame/monkeytype)
  (GPL-3.0); credit for the original palettes goes to their authors there.

## Copyright

© 2026 Ashutosh Adhikari. All rights reserved.

The code, design and content in this repository may not be copied,
modified, redistributed or reused, in whole or in part, without written
permission.
