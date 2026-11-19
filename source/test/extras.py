# Browser run of t12 additions at phone and desktop sizes: first-time tips, the demo event, check-in,
# not-checked-in players in scoring and missing scores, Help, Privacy (in the app and as a page), the About page.
import sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8787/'
BUILD = sys.argv[1] if len(sys.argv) > 1 else ''

def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    shot = lambda n: pg.screenshot(path=f'test/x-{name}-{n}.png', full_page=True)
    sheet = lambda: pg.locator('.sheet').last
    pg.goto(URL); pg.wait_for_selector('.tip')
    if BUILD: assert BUILD in pg.inner_text('body')
    assert 'Try the demo' in pg.inner_text('.tip'), 'home tip'
    shot('1-home')
    pg.locator('.tip button[aria-label="Hide tip"]').click(); assert pg.locator('.tip').count() == 0
    pg.reload(); pg.wait_for_selector('text=New event'); assert pg.locator('.tip').count() == 0, 'hidden tip stays hidden'

    # demo
    pg.locator('button', has_text='Try the demo').click(); pg.wait_for_selector('.rrow')
    body = pg.inner_text('main'); assert 'Ava M' in body and 'not scored' in body, 'demo results'
    assert pg.locator('.rrow.none').count() == 1, 'one player (no-show) unscored'
    assert pg.locator('.tip').count() == 1, 'results tip'
    shot('2-demo-results')
    pg.locator('.tip button[aria-label="Hide tip"]').click()
    pg.locator('button', has_text='Missing scores').click(); pg.wait_for_selector('text=Not scored by anyone')
    m = pg.inner_text('main').lower(); assert 'coach cam' in m and 'coach ana' in m, 'demo missing scores'
    assert 'piper c' not in m, 'the no-show is not listed as missing'
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.rrow')

    # check-in
    pg.locator('.seg button', has_text='Players').click(); pg.wait_for_selector('text=Check-in · 15/16')
    assert pg.locator('.prow2.out').count() == 1, 'no-show faded on the player list'
    pg.locator('button', has_text='Check-in · 15/16').click(); pg.wait_for_selector('.ckrow')
    assert '15 of 16 here' in pg.inner_text('header')
    pg.locator('.ckfind input').fill('18'); time.sleep(0.3); assert pg.locator('.ckrow').count() == 1, 'find by number'
    pg.locator('.ckrow').click(); time.sleep(0.2); assert '16 of 16 here' in pg.inner_text('header')
    pg.locator('.ckrow').click(); time.sleep(0.2); assert '15 of 16 here' in pg.inner_text('header')
    pg.locator('.ckfind input').fill(''); time.sleep(0.3)
    assert pg.locator('.ckrow').count() == 16
    shot('3-checkin')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=Start scoring')

    # scoring lists put the no-show last and Next skips them
    pg.locator('button', has_text='Start scoring').click(); sheet().locator('input.inp').fill('Coach J'); sheet().locator('button', has_text='Start scoring').click()
    sheet().locator('.item', has_text='Group B').click(); pg.wait_for_selector('.subtabs')
    pg.locator('.seg button', has_text='By name').click(); pg.wait_for_selector('.prow2')
    t = pg.inner_text('main'); assert 'NOT CHECKED IN' in t.upper() and t.upper().index('NOT CHECKED IN') < t.index('Piper C'), 'no-show in its own section'
    shot('4-byname')
    pg.locator('.prow2', has_text='Olivia J').click(); pg.wait_for_selector('.srow')
    assert 'Next: #18' not in pg.inner_text('main'), 'Next skips the no-show'
    pg.click('button[aria-label="Back"]'); pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=Start scoring')
    pg.evaluate("location.hash = '#/'"); pg.wait_for_selector('text=New event')

    # help, privacy in the app
    pg.locator('.item', has_text='Help').click(); pg.wait_for_selector('details.faq')
    assert pg.locator('details.faq[open]').count() == 1
    pg.locator('summary', has_text='Check-in').click(); assert pg.locator('details.faq[open]').count() == 2
    shot('5-help')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=New event')
    pg.locator('.item', has_text='Privacy').click(); pg.wait_for_selector('.privdoc h2')
    assert 'Where it is kept' in pg.inner_text('main') and '400 days' in pg.inner_text('main')
    shot('6-privacy-app')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=New event')
    pg.locator('.item', has_text='Show tips again').click(); time.sleep(0.2); assert pg.locator('.tip').count() == 1, 'tips back'

    # pages
    pg.goto(URL + 'about'); pg.wait_for_selector('h1'); assert 'every coach' in pg.inner_text('h1')
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'about page fits the screen'
    shot('7-about')
    pg.goto(URL + 'privacy'); pg.wait_for_selector('h1'); assert 'Privacy' in pg.inner_text('h1')
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    shot('8-privacy-page')
    pg.goto(URL + 'about'); pg.locator('a', has_text='Try the demo').first.click(); pg.wait_for_selector('.rrow')
    assert pg.evaluate("JSON.parse(localStorage.getItem('rp.v1')).events.filter(e => e.demo).length") == 1, 'demo link reuses the demo'
    bad = [e for e in errs if 'Failed to load resource' not in e]
    b.close()
    return bad

with sync_playwright() as p:
    for name, vp, mobile in (('phone', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1280, 'height': 900}, False)):
        bad = run(p, name, vp, mobile); print(name, 'errors:', bad); assert not bad
print('EXTRAS OK')
