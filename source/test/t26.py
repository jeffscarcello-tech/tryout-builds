# Browser run of t26: the new landing page at phone and desktop sizes. Fits the screen, no errors, sections reveal
# while scrolling, links work, reduced motion shows everything. Full-page screenshots for a look.
import sys, time
from playwright.sync_api import sync_playwright
URL = 'http://localhost:8787/'; BUILD = sys.argv[1] if len(sys.argv) > 1 else ''
def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + 'about'); pg.wait_for_selector('.welcome .tagline')
    if BUILD: assert ('?v=' + BUILD) in pg.content()
    assert 'Welcome to' in pg.inner_text('h1') and 'every coach' in pg.inner_text('.ht')
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'fits the screen'
    time.sleep(3.4); pg.screenshot(path=f'test/t26-{name}-1-top.png')
    hidden = pg.evaluate("[...document.querySelectorAll('.rv')].filter(e => !e.classList.contains('in')).length")
    assert hidden > 0, 'lower sections wait to reveal'
    h = pg.evaluate('document.body.scrollHeight')
    for y in range(0, h + 800, 400): pg.evaluate(f'window.scrollTo(0,{y})'); time.sleep(0.12)
    time.sleep(0.9)
    assert pg.evaluate("[...document.querySelectorAll('.rv')].every(e => e.classList.contains('in'))"), 'everything shows after scrolling'
    pg.evaluate('window.scrollTo(0,0)'); time.sleep(0.3)
    pg.screenshot(path=f'test/t26-{name}-2-full.png', full_page=True)
    assert pg.locator('.sports span').count() == 14 and pg.locator('.feat').count() == 9
    pg.locator('.final a', has_text='Try the demo').click(); pg.wait_for_selector('.rrow')
    # reduced motion: nothing hidden, no animation
    ctx2 = b.new_context(viewport=vp, reduced_motion='reduce'); p2 = ctx2.new_page(); p2.goto(URL + 'about'); p2.wait_for_selector('.final')
    assert p2.evaluate("getComputedStyle(document.querySelector('.final').closest('.rv')).opacity") == '1'
    b.close(); assert not errs, errs; print(name, 'ok')
with sync_playwright() as p:
    run(p, 'phone', {'width': 390, 'height': 844}, True); run(p, 'desktop', {'width': 1280, 'height': 900}, False)
print('T26 OK')
