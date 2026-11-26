#!/usr/bin/env python3
"""Adds the tee and green pins from a course map file (saved from the app's Setup page) to the pins that ship with the app.

    python3 src/add_map.py "Stroke Ledger course map 2026-12-01.json"
    python3 src/build.py

Only courses that already exist in src/geo.json or src/seed.json are taken, matched by their id.
"""
import json, os, sys
SRC = os.path.dirname(os.path.abspath(__file__))
geo = json.load(open(os.path.join(SRC, 'geo.json'))); seed = json.load(open(os.path.join(SRC, 'seed.json')))
known = {c['id']: len(c['holes']) for c in seed['courses']['list']}
src = json.load(open(sys.argv[1])); assert src.get('app') == 'stroke-ledger-map', 'not a Stroke Ledger course map file'
ok = lambda p: isinstance(p, list) and len(p) == 2 and all(isinstance(v, (int, float)) for v in p) and abs(p[0]) <= 90 and abs(p[1]) <= 180
for c in src['courses']:
    if c['id'] not in known: print('skipped (not a built-in course):', c.get('name')); continue
    g = geo['courses'].setdefault(c['id'], {'loc': None, 'holes': []})
    holes = (g.get('holes') or []) + [None] * known[c['id']]; holes = holes[:known[c['id']]]; n = 0
    for i, h in enumerate((c.get('holes') or [])[:known[c['id']]]):
        if not h: continue
        ring = [[round(p[0], 6), round(p[1], 6)] for p in (h.get('g') or []) if ok(p)]
        if len(ring) < 3: continue
        holes[i] = {'t': [round(v, 6) for v in h['t']] if ok(h.get('t')) else None, 'g': ring}; n += 1
    g['holes'] = holes
    if ok(c.get('loc')) and not g.get('loc'): g['loc'] = c['loc']
    print(f"{c.get('name')}: {n} holes taken, {sum(1 for h in holes if h)} of {len(holes)} now built in")
json.dump(geo, open(os.path.join(SRC, 'geo.json'), 'w'), indent=1); print('wrote src/geo.json; now run src/build.py')
