# Browser run of t24: event colours on the Home screen (phone and desktop, dark and bright light mode),
# colours kept after reload and different for neighbouring cards. Needs test/serve.mjs on :8787.
import sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8787/'
BUILD = sys.argv[1] if len(sys.argv) > 1 else ''

def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('rp.notips','1')")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '#/demo'); pg.wait_for_selector('.rrow')
    if BUILD: assert BUILD in pg.content()
    pg.evaluate("""() => { const r = window.__rp;
      const sp = r.SPORTS.find(s => s.id === 'basketball'), hk = r.SPORTS.find(s => s.id === 'hockey'), vb = r.SPORTS.find(s => s.id === 'volleyball');
      r.newEvent('U13 boys basketball', 'basketball', r.formFromSport(sp));
      const f = r.newEvent('Spring hockey camp', 'hockey', r.formFromSport(hk)); f.locked = true;
      r.newEvent('Club 16U tryouts', 'volleyball', r.formFromSport(vb));
      r.newEvent('Beach', 'volleyball', r.formFromSport(vb)); }""")
    pg.goto(URL + '#/'); pg.wait_for_selector('.evcard')
    time.sleep(0.4)
    cards = pg.locator('.evcard'); n = cards.count(); assert n == 5, n
    cols = [cards.nth(i).evaluate("e => getComputedStyle(e).getPropertyValue('--ec').trim()") for i in range(n)]
    assert len(set(cols)) == 5, cols                       # 5 events, 5 different colours
    tiles = [cards.nth(i).locator('.evtile').inner_text() for i in range(n)]
    assert 'BE' in tiles and 'SH' in tiles and 'UB' in tiles, tiles
    assert 'Finished' in cards.filter(has_text='Spring hockey camp').inner_text()
    assert 'Demo' in cards.filter(has_text='Demo').inner_text()
    pg.screenshot(path=f'test/t24-{name}-1-home.png', full_page=False)
    pg.reload(); pg.wait_for_selector('.evcard')
    cols2 = [pg.locator('.evcard').nth(i).evaluate("e => getComputedStyle(e).getPropertyValue('--ec').trim()") for i in range(n)]
    assert cols == cols2, 'colours stay the same after reload'
    pg.locator('.item', has_text='Bright light mode').click(); time.sleep(0.3)
    pg.evaluate("window.scrollTo(0, 0)"); pg.screenshot(path=f'test/t24-{name}-2-home-bright.png')
    pg.locator('.item', has_text='Bright light mode').click(); time.sleep(0.2)
    pg.locator('.evcard', has_text='Spring hockey camp').click(); pg.wait_for_selector('.seg')   # cards still open their event
    b.close()
    assert not errs, errs
    print(name, 'ok')

with sync_playwright() as p:
    run(p, 'phone', {'width': 390, 'height': 844}, True)
    run(p, 'desktop', {'width': 1280, 'height': 900}, False)
print('T24 OK')
