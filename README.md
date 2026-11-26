# Stroke Ledger

A strokes-gained golf notebook that runs in the browser, built for a phone on the course:
log every shot, see where strokes are won and lost against a tour, scratch or handicap benchmark,
and use a satellite map with GPS to read distances, pick an aim point and mark where each shot finished.

**Open it:** https://modulin24.github.io/stroke-ledger/

On an iPhone, open that link in Safari, tap Share, then **Add to Home Screen**.

## Good to know

- Everything you enter stays on your own device. Nothing is uploaded and nothing syncs between devices.
  Save a backup file from Setup now and then.
- The satellite photo comes from Esri (ArcGIS World Imagery). Map drawing is by MapLibre GL JS.
- This is a homemade tool shared between friends. It is not affiliated with any golf brand or app.

## For the site owner

- `config.js` holds the Esri API key that turns on the satellite photo. Paste the key between the
  quote marks after `esriKey:` and save. The key is locked to this site's address in the Esri dashboard.
- `index.html`, `geo.js`, `sw.js`, `manifest.webmanifest` and `icons/` are built files. They are produced
  from the sources in `src/` by running `python3 src/build.py`. Edit the sources, not the built files.
- `src/geo.json` holds the tee and green pins that ship with the app. `python3 src/add_map.py <map file>`
  adds the pins from a course map file saved in the app's Setup page.
- Tests: `node src/tests/t1_map_hole.js` (and `t2` to `t7`) run the app in an emulated iPhone.

## Licences of the parts used

- MapLibre GL JS, BSD 3-Clause: `vendor/maplibre-LICENSE.txt`
- SheetJS Community Edition, Apache 2.0: `vendor/xlsx-LICENSE.txt`
- Barlow and Barlow Condensed fonts, SIL Open Font License 1.1: `fonts/barlow-LICENSE.txt`, `fonts/barlow-condensed-LICENSE.txt`
