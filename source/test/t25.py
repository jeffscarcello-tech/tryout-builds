# Browser run of t25: the tagline on the Home screen, the About page and in the PDF footer, at phone and desktop sizes.
import sys, time, zlib, re
from playwright.sync_api import sync_playwright
URL = 'http://localhost:8787/'; BUILD = sys.argv[1] if len(sys.argv) > 1 else ''
T = 'Keep your finger on the pulse of every tryout.'
def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1, accept_downloads=True)
    ctx.add_init_script("localStorage.setItem('rp.notips','1')"); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('text=New event')
    if BUILD: assert BUILD in pg.content()
    assert pg.locator('.hero .tagline').inner_text() == T; pg.screenshot(path=f'test/t25-{name}-1-home.png')
    pg.goto(URL + 'about'); pg.wait_for_selector('.welcome .tagline')
    assert pg.locator('.welcome .tagline').inner_text() == T; pg.screenshot(path=f'test/t25-{name}-2-about.png')
    pg.goto(URL + '#/demo'); pg.wait_for_selector('.rrow')
    pg.locator('.rrow').first.click(); pg.wait_for_selector('text=Save as PDF')
    pg.locator('button', has_text='Save as PDF').last.click(); pg.wait_for_selector('.paper')
    with pg.expect_download() as d: pg.locator('button', has_text='Save as PDF').first.click()
    raw = open(d.value.path(), 'rb').read(); txt = b''
    for m in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream', raw, re.S):
        try: txt += zlib.decompress(m.group(1))
        except Exception: txt += m.group(1)
    assert b'pulse of every tryout' in txt, 'tagline in PDF footer'
    b.close(); assert not errs, errs; print(name, 'ok')
with sync_playwright() as p:
    run(p, 'phone', {'width': 390, 'height': 844}, True); run(p, 'desktop', {'width': 1280, 'height': 900}, False)
print('T25 OK')
