# Several phones scoring one event: an organizer and two evaluators in separate browsers (separate storage),
# against the local loader server (test/serve.mjs). Covers share code, link join, typed join, scoring,
# offline queue then reconnect, roster change reaching evaluators, live results and missing scores,
# private notes kept off evaluator phones, remove an evaluator, stop sharing.
import sys, time, json
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8787/'
BUILD = sys.argv[1] if len(sys.argv) > 1 else ''

def wait_for(fn, what, secs=40):
    end = time.time() + secs
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.5)
    raise AssertionError('timed out: ' + what)

state = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('rp.v1'))")
def waiting(pg):
    ev = state(pg)['events'][0]
    return sum(1 for box in (ev.get('scores') or {}, ev.get('notes') or {}) for r in box.values() if r and r.get('q'))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    phone = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pages, errs = {}, []
    for name, opts in (('org', dict(viewport={'width': 1280, 'height': 900})), ('e1', phone), ('e2', phone)):
        ctx = b.new_context(**opts); pg = ctx.new_page(); pages[name] = (ctx, pg)
        pg.on('pageerror', lambda e, n=name: errs.append(n + ': ' + str(e)))
        pg.on('console', lambda m, n=name: errs.append(n + ': ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    (octx, org), (c1, e1), (c2, e2) = pages['org'], pages['e1'], pages['e2']
    sheet = lambda pg: pg.locator('.sheet').last

    # organizer: event, roster (with a private note), share
    org.goto(URL); org.wait_for_selector('text=New event')
    if BUILD: assert BUILD in org.inner_text('body')
    org.click('text=New event'); sheet(org).locator('input.inp').fill('Multi test')
    sheet(org).locator('button.chip', has_text='Volleyball').click(); sheet(org).locator('text=Create event').click()
    org.wait_for_selector('text=Import list'); org.click('text=Import list')
    sheet(org).locator('textarea').fill('Number,Name,Notes\n4,Sam L,secret note\n7,Jo P,\n9,Ava C,'); time.sleep(0.4)
    sheet(org).locator('button', has_text='Import').last.click(); org.wait_for_selector('text=Sam L')
    org.click('text=Share with evaluators'); sheet(org).locator('button', has_text='Start sharing').click()
    org.wait_for_selector('.jcode'); code = org.locator('.jcode').inner_text().replace('\n', '').replace(' ', '')
    assert len(code) == 6, code
    assert org.locator('.qrbox svg').count() == 1, 'QR shown'
    org.screenshot(path='test/multi-1-share.png')
    sheet(org).locator('button', has_text='Done').click()
    evid = state(org)['events'][0]['id']
    print('code', code)

    # evaluator 1: opens the link
    e1.goto(URL + 'j/' + code); e1.wait_for_selector('input.jinp')
    assert e1.locator('input.jinp').input_value() == code, 'code filled from link'
    assert '/j/' not in e1.url, 'address cleaned'
    sheet(e1).locator('input.inp').nth(1).fill('Coach A'); sheet(e1).locator('button', has_text='Join').click()
    e1.wait_for_selector('text=you are scoring as Coach A'); body = e1.inner_text('body')
    assert 'Results' not in body and 'Form' not in body, 'evaluators see scoring only'
    assert 'secret note' not in json.dumps(state(e1)), 'private notes stay off evaluator phones'
    e1.screenshot(path='test/multi-2-evaluator.png')
    e1.click('text=Start scoring'); e1.wait_for_selector('.keypad')
    e1.locator('.key', has_text='4').click(); e1.wait_for_selector('.srow')
    rows = e1.locator('.srow:has(.sbtns)')
    for i in range(3): rows.nth(i).locator('.sb').nth(3).click()
    wait_for(lambda: waiting(e1) == 0, 'e1 scores sent', 20)

    # evaluator 2: types the code from the home screen, then loses signal
    e2.goto(URL); e2.wait_for_selector('text=Join as evaluator'); e2.click('text=Join as evaluator')
    sheet(e2).locator('input.jinp').fill(code.lower()); sheet(e2).locator('input.inp').nth(1).fill('Coach B')
    sheet(e2).locator('button', has_text='Join').click(); e2.wait_for_selector('text=you are scoring as Coach B')
    c2.set_offline(True); e2.evaluate("window.dispatchEvent(new Event('offline'))")
    e2.click('text=Start scoring'); e2.wait_for_selector('.keypad'); e2.locator('.key', has_text='7').click(); e2.wait_for_selector('.srow')
    rows = e2.locator('.srow:has(.sbtns)')
    for i in range(2): rows.nth(i).locator('.sb').nth(1).click()
    time.sleep(2.5); assert waiting(e2) == 2, 'scores wait while offline: %d' % waiting(e2)
    e2.click('button[aria-label="Back"]'); e2.click('button[aria-label="Back"]'); e2.wait_for_selector('text=you are scoring as Coach B')
    assert 'waiting' in e2.inner_text('header'), e2.inner_text('header')
    e2.screenshot(path='test/multi-3-offline.png')
    c2.set_offline(False); e2.evaluate("window.dispatchEvent(new Event('online'))")
    wait_for(lambda: waiting(e2) == 0, 'e2 queue sent after reconnect', 20)

    # organizer sees both evaluators' scores (live, no reload)
    org.locator('.seg button', has_text='Results').click()
    def org_has():
        ev = state(org)['events'][0]; names = set((ev.get('evaluators') or {}).values())
        bys = {k.split('|')[0] for k, r in ev['scores'].items() if r.get('v') is not None}
        return {'Coach A', 'Coach B'} <= names and len(bys) == 2
    wait_for(org_has, 'organizer received both evaluators', 40)
    wait_for(lambda: '%' in org.locator('.prow2, .rrow, main').first.inner_text(), 'results show a score', 15)
    org.screenshot(path='test/multi-4-results.png')
    org.evaluate("location.hash = '#/m/%s'" % evid); org.wait_for_selector('text=Not scored by anyone')
    mb = org.inner_text('main').lower(); assert 'coach a' in mb and 'coach b' in mb, 'missing scores lists both evaluators'

    # roster change reaches evaluators
    org.evaluate("location.hash = '#/e/%s/players'" % evid); org.wait_for_selector('text=Import list')
    org.click('text=Add player'); sheet(org).locator('input.inp').nth(0).fill('11'); sheet(org).locator('input.inp').nth(1).fill('New K')
    sheet(org).locator('button', has_text='Save').last.click(); org.wait_for_selector('text=New K')
    wait_for(lambda: any(pl.get('name') == 'New K' for pl in state(e1)['events'][0]['players']), 'new player reached evaluator 1', 40)

    # remove evaluator 2
    org.click('text=Evaluators · code'); org.wait_for_selector('text=Coach B')
    sheet(org).locator('button[aria-label="Remove Coach B"]').click(); org.locator('.sheet button', has_text='Remove').last.click(); time.sleep(1)
    e2.click('text=Start scoring'); e2.wait_for_selector('.keypad'); e2.locator('.key', has_text='9').click(); e2.wait_for_selector('.srow')
    e2.locator('.srow:has(.sbtns)').nth(0).locator('.sb').nth(2).click()
    e2.click('button[aria-label="Back"]'); e2.click('button[aria-label="Back"]')
    wait_for(lambda: 'Removed by organizer' in e2.inner_text('body'), 'evaluator 2 told they were removed', 40)

    # stop sharing
    org.keyboard.press('Escape'); time.sleep(0.3)
    if org.locator('.sheet').count() == 0: org.click('text=Evaluators · code')
    org.locator('.sheet button', has_text='Stop sharing').first.click(); org.locator('.sheet button', has_text='Stop sharing').last.click()
    org.wait_for_selector('text=Share with evaluators')
    e1.click('button[aria-label="Back"]'); e1.click('button[aria-label="Back"]')
    wait_for(lambda: 'stopped sharing' in e1.inner_text('body').lower(), 'evaluator 1 told sharing stopped', 40)
    assert len(state(org)['events'][0]['scores']) >= 5, 'organizer keeps the scores after stopping'
    e1.screenshot(path='test/multi-5-stopped.png')

    bad = [e for e in errs if 'status of 4' not in e]
    print('errors:', bad)
    assert not bad, bad
    print('MULTI OK')
