"""List a take's events in a readable table, to write storyboard refs from.

usage: python3 scripts/list-events.py <take dir> [<take dir> ...] [--all]

Per take: pointerStart, the usable span (take.json sync.keep), then every event as
time, end, type, label (moves with from -> to and cursor, events with a box with x,y,w x h).
Cursor and sync events are left out; --all keeps them. The labels are what "type:label" refs use.
"""
import json, os, sys

args = sys.argv[1:]
ALL = "--all" in args
args = [a for a in args if a != "--all"]
for d in args:
    e = json.load(open(os.path.join(d, 'events.json')))
    tjp = os.path.join(d, 'take.json')
    tj = json.load(open(tjp)) if os.path.exists(tjp) else {}
    print('==', d, e.get('schema'), 'pointerStart', e.get('pointerStart'), 'keep', tj.get('sync', {}).get('keep'))
    for x in e['events']:
        if not ALL and x['type'] in ('cursor', 'sync'):
            continue
        s = f"{x['t']:7.2f} {('-%.2f' % x['tEnd']) if x.get('tEnd') else '      '} {x['type']:9} {str(x.get('label', ''))[:42]:42}"
        if x['type'] == 'move':
            s += f" {x['from']['x']:.0f},{x['from']['y']:.0f}->{x['to']['x']:.0f},{x['to']['y']:.0f} {x.get('cursor', '')}"
        b = x.get('box')
        if b:
            s += f" box {b['x']:.0f},{b['y']:.0f},{b.get('width', b.get('w', 0)):.0f}x{b.get('height', b.get('h', 0)):.0f}"
        print(s)
