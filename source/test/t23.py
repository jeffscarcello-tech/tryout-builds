# Browser run of t23: Open on my phone. The computer (desktop or phone size) makes an event with a pasted list,
# taps Open on my phone (sharing starts by itself), the phone opens the link from the QR code, gets the name filled in,
# joins and has the whole list. Then changes go both ways. Needs test/serve.mjs on :8787.
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
LIST = '4\tAva B\tSetter\n7\tMia K\tLibero\n12\tNora T\tMiddle\n15\tLily R\tOutside'

def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    errs = []
    cctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    cctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.rstrip('/'))
    cctx.add_init_script("localStorage.setItem('rp.notips','1'); try { delete Navigator.prototype.share } catch (e) {}")
    pctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pctx.add_init_script("localStorage.setItem('rp.notips','1')")
    comp, ph = cctx.new_page(), pctx.new_page()
    for n, pg in (('computer', comp), ('phone', ph)):
        pg.on('pageerror', lambda e, n=n: errs.append(n + ': ' + str(e)))
        pg.on('console', lambda m, n=n: errs.append(n + ': ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    sheet = lambda pg: pg.locator('.sheet').last

    # computer: name, event, pasted list
    comp.goto(URL); comp.wait_for_selector('text=New event')
    if BUILD: assert BUILD in comp.content()
    comp.evaluate("window.__rp.S.settings.me = { id: 'vcomp', name: 'Coach Jeff' }")
    comp.click('text=New event'); sheet(comp).locator('input.inp').fill('Phone move test')
    sheet(comp).locator('button.chip', has_text='Volleyball').click(); sheet(comp).locator('text=Create event').click()
    comp.wait_for_selector('text=Import list'); comp.locator('button', has_text='Import list').click(); comp.wait_for_selector('.sheet textarea')
    sheet(comp).locator('textarea').fill(LIST); comp.wait_for_selector('.preview'); sheet(comp).locator('button', has_text='Import').last.click()
    comp.wait_for_selector('text=Lily R')
    assert not state(comp)['events'][0].get('share'), 'not shared yet'

    # ••• Open on my phone
    comp.locator('button[aria-label="Event options"]').click(); comp.wait_for_selector('.sheet .item')
    comp.locator('.sheet .item', has_text='Open on my phone').click()
    comp.wait_for_selector('text=Open on your phone'); comp.wait_for_selector('.jcode8')
    code = comp.locator('.jcode8').inner_text().replace('\n', '').replace(' ', ''); assert len(code) == 8, code
    assert comp.locator('.sheet .qrbox svg').count() == 1
    assert state(comp)['events'][0]['share'].get('key'), 'sharing started by itself'
    time.sleep(0.5); comp.screenshot(path=f'test/t23-{name}-1-open-on-phone.png')
    comp.locator('.sheet button', has_text='Send link').click(); time.sleep(0.4)
    link = comp.evaluate("navigator.clipboard.readText()")
    assert link == URL + 'j/' + code + '?n=Coach%20Jeff', link
    comp.locator('.sheet button', has_text='Done').last.click(); time.sleep(0.3)

    # phone: open the link (what the camera does), name already filled in, join
    ph.goto(link); ph.wait_for_selector('input.jinp')
    assert ph.locator('input.jinp').input_value() == code
    assert sheet(ph).locator('input.inp').nth(1).input_value() == 'Coach Jeff', 'name filled in from the link'
    assert '?n=' not in ph.url, 'link tidied'
    ph.screenshot(path=f'test/t23-{name}-2-phone-join.png')
    sheet(ph).locator('button', has_text='Join').click(); ph.wait_for_selector('text=Phone move test')
    ev = state(ph)['events'][0]
    assert {pl['name'] for pl in ev['players']} == {'Ava B', 'Mia K', 'Nora T', 'Lily R'}, 'whole list on the phone'
    evid = ev['id']
    ph.evaluate("location.hash = '#/e/%s/players'" % evid); ph.wait_for_selector('text=Lily R')
    ph.screenshot(path=f'test/t23-{name}-3-phone-list.png')

    # the code works once
    ph2 = b.new_context(viewport={'width': 390, 'height': 844}).new_page(); ph2.add_init_script("localStorage.setItem('rp.notips','1')")
    ph2.goto(URL + 'j/' + code); ph2.wait_for_selector('input.jinp')
    sheet(ph2).locator('input.inp').nth(1).fill('Someone'); sheet(ph2).locator('button', has_text='Join').click(); time.sleep(1.5)
    assert not (state(ph2) or {}).get('events'), 'used code refused'

    # changes both ways
    ph.click('text=Add player'); sheet(ph).locator('input.inp').nth(0).fill('22'); sheet(ph).locator('input.inp').nth(1).fill('Added On Phone')
    sheet(ph).locator('button', has_text='Save').last.click(); ph.wait_for_selector('text=Added On Phone')
    wait_for(lambda: any(pl['name'] == 'Added On Phone' for pl in state(comp)['events'][0]['players']), 'phone change reaches the computer')
    comp.evaluate("window.__rp.syncEvent(window.__rp.S.events[0])")
    comp.locator('.prow2', has_text='Ava B').click(); comp.wait_for_selector('text=How they were scored')
    comp.locator('button', has_text='Edit').first.click(); sheet(comp).locator('input.inp').nth(1).fill('Ava Brown'); sheet(comp).locator('button', has_text='Save').last.click()
    wait_for(lambda: any(pl['name'] == 'Ava Brown' for pl in state(ph)['events'][0]['players']), 'computer change reaches the phone')

    # the menu item is not offered to the joined phone (only the owner can make codes)
    ph.locator('button[aria-label="Event options"]').click(); ph.wait_for_selector('.sheet .item')
    assert ph.locator('.sheet .item', has_text='Open on my phone').count() == 0
    b.close()
    assert not errs, errs
    print(name, 'ok')

with sync_playwright() as p:
    run(p, 'desktop', {'width': 1280, 'height': 900}, False)
    run(p, 'phone', {'width': 390, 'height': 844}, True)
print('t23 ok')
