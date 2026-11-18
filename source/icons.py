#!/usr/bin/env python3
"""Draw the PNG icons from src/img/icon.svg (run again only when the logo changes)."""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, 'src', 'img')
svg = open(os.path.join(IMG, 'icon.svg'), encoding='utf-8').read()
# maskable: logo shrunk into the safe zone on a full dark square
mask = svg.replace('<rect width="512" height="512" rx="112" fill="#0b0b0e"/>', '<rect width="512" height="512" fill="#0b0b0e"/><g transform="translate(76.8 76.8) scale(.7)">', 1).replace('</svg>', '</g></svg>')
# apple: full square (iOS rounds it)
apple = svg.replace('rx="112" ', '', 1)
jobs = [('icon-192.png', svg, 192), ('icon-512.png', svg, 512), ('icon-maskable-512.png', mask, 512), ('apple-touch-icon.png', apple, 180)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for name, s, px in jobs:
        pg = b.new_page(viewport={'width': px, 'height': px})
        pg.set_content('<html><body style="margin:0;background:transparent">' + s.replace('<svg ', '<svg width="%d" height="%d" ' % (px, px), 1) + '</body></html>')
        pg.screenshot(path=os.path.join(IMG, name), omit_background=True, clip={'x': 0, 'y': 0, 'width': px, 'height': px})
        pg.close()
    b.close()
print('icons done')
