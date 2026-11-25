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
    for name, opts in (('org', dict(viewport={'width': 1280, 'height': 900})), ('e1', phone), ('e2', phone), ('o2', phone)):
        ctx = b.new_context(**opts); ctx.add_init_script("localStorage.setItem('rp.notips','1')"); pg = ctx.new_page(); pages[name] = (ctx, pg)
        pg.on('pageerror', lambda e, n=name: errs.append(n + ': ' + str(e)))
        pg.on('console', lambda m, n=name: errs.append(n + ': ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    (octx, org), (c1, e1), (c2, e2), (co2, o2) = pages['org'], pages['e1'], pages['e2'], pages['o2']
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
    e1.locator('.key', has_text='4').click(); e1.locator('.key', has_text='Go').click(); e1.wait_for_selector('.srow')
    rows = e1.locator('.srow:has(.sbtns)')
    for i in range(3): rows.nth(i).locator('.sb').nth(3).click()
    wait_for(lambda: waiting(e1) == 0, 'e1 scores sent', 20)

    # evaluator 2: types the code from the home screen, then loses signal
    e2.goto(URL); e2.wait_for_selector('text=Join with a code'); e2.click('text=Join with a code')
    sheet(e2).locator('input.jinp').fill(code.lower()); sheet(e2).locator('input.inp').nth(1).fill('Coach B')
    sheet(e2).locator('button', has_text='Join').click(); e2.wait_for_selector('text=you are scoring as Coach B')
    c2.set_offline(True); e2.evaluate("window.dispatchEvent(new Event('offline'))")
    e2.click('text=Start scoring'); e2.wait_for_selector('.keypad'); e2.locator('.key', has_text='7').click(); e2.locator('.key', has_text='Go').click(); e2.wait_for_selector('.srow')
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

    # station: evaluator 1 scores only one skill
    org.evaluate("location.hash = '#/e/%s/players'" % evid); org.wait_for_selector('text=Import list')
    org.click('text=Evaluators · ' + code); org.wait_for_selector('.erow')
    org.locator('.erow', has_text='Coach A').locator('button', has_text='Station').click(); org.wait_for_selector('text=Coach A\'s station')
    org.locator('.sheet').last.locator('.chip', has_text='Passing').click(); time.sleep(0.2)
    org.locator('.sheet').last.locator('button', has_text='Done').click(); time.sleep(0.3)
    if org.locator('.sheet').count(): org.locator('.sheet button', has_text='Done').last.click()
    vidA0 = state(e1)['events'][0]['join']['vid']
    wait_for(lambda: (state(e1)['events'][0].get('stations') or {}).get(vidA0), 'station reached evaluator 1', 40)
    e1.click('button[aria-label="Back"]'); e1.wait_for_selector('.keypad'); e1.locator('.key', has_text='9').click(); e1.locator('.key', has_text='Go').click(); e1.wait_for_selector('.srow')
    assert e1.locator('.srow').count() == 1 and 'Passing' in e1.inner_text('main'), 'station: only Passing to score'
    e1.screenshot(path='test/multi-4a-station.png')
    e1.click('button[aria-label="Back"]'); e1.click('button[aria-label="Back"]'); e1.wait_for_selector('text=Start scoring')

    # let evaluator 1 check players in; their check-in reaches the organizer and back out to everyone
    org.click('text=Evaluators · ' + code); org.wait_for_selector('.erow')
    org.locator('.erow', has_text='Coach A').locator('button', has_text='Can check in').click(); time.sleep(0.3)
    org.screenshot(path='test/multi-4b-evaluator-settings.png')
    sheet(org).locator('button', has_text='Done').click()
    vidA = state(e1)['events'][0]['join']['vid']
    wait_for(lambda: vidA in (state(e1)['events'][0].get('helpers') or []), 'helper permission reached evaluator 1', 40)
    e1.wait_for_selector('text=Check in players')
    e1.click('text=Check in players'); e1.wait_for_selector('.ckrow')
    e1.locator('.ckrow', has_text='Jo P').click(); e1.locator('.ckrow', has_text='Sam L').click(); time.sleep(0.3)
    assert e1.locator('.ckrow.on').count() == 2
    e1.screenshot(path='test/multi-4c-checkin.png')
    def org_sees_checkin():
        ev = state(org)['events'][0]
        return sum(1 for k, r in (ev.get('checks') or {}).items() if k.startswith(vidA + '|') and r.get('v') == 1) == 2
    wait_for(org_sees_checkin, 'organizer received the check-ins', 40)
    org.evaluate("location.hash = '#/e/%s/players'" % evid); org.wait_for_selector('text=Check-in · 2/')
    assert org.locator('.prow2.out').count() == 2, 'players not checked in are faded'
    e1.click('button[aria-label="Back"]'); e1.wait_for_selector('text=Start scoring')

    # a second organizer: invite, join by link, sees everything, decisions and roster changes both ways
    org.click('text=Evaluators · ' + code);     org.wait_for_selector('text=Add an organizer')
    org.locator('.sheet button', has_text='Add an organizer').click(); org.wait_for_selector('.jcode8')
    inv = org.locator('.jcode8').inner_text().replace('\n', '').replace(' ', ''); assert len(inv) == 8, inv
    time.sleep(0.6); org.screenshot(path='test/multi-6-org-invite.png')
    org.locator('.sheet button', has_text='Done').last.click(); time.sleep(0.3)
    if org.locator('.sheet').count(): org.locator('.sheet button', has_text='Done').last.click()
    o2.goto(URL + 'j/' + inv); o2.wait_for_selector('input.jinp')
    sheet(o2).locator('input.inp').nth(1).fill('Coach Two'); sheet(o2).locator('button', has_text='Join').click()
    o2.wait_for_selector('.rrow')
    def o2_has_all():
        ev = state(o2)['events'][0]
        return ev['share'].get('oid') and len({k.split('|')[0] for k, r in ev['scores'].items()}) >= 2 and any(pl.get('notes') == 'secret note' for pl in ev['players'])
    wait_for(o2_has_all, 'second organizer gets every score and private notes', 40)
    assert 'Results' in o2.inner_text('body') and 'Form' in o2.inner_text('body'), 'second organizer has the full event'
    o2.screenshot(path='test/multi-7-second-organizer.png')
    o2.locator('button', has_text='Team decisions').click(); o2.wait_for_selector('.drow')
    o2.locator('.drow', has_text='Sam L').locator('.dchip', has_text='Made team').click()
    def org_sees_decision():
        ev = state(org)['events'][0]
        return any(r.get('v') == 'made' for r in (ev.get('decs') or {}).values())
    wait_for(org_sees_decision, 'owner gets the second organizer\'s decision', 40)
    assert not any('decs' in json.dumps(ev) and ev.get('decs') for ev in state(e1)['events']), 'evaluators never get decisions'
    org.evaluate("location.hash = '#/e/%s/players'" % evid); org.wait_for_selector('text=Jo P')
    org.locator('.prow2', has_text='Jo P').click(); org.wait_for_selector('text=How they were scored')
    org.locator('button', has_text='Edit').first.click(); sheet(org).locator('input.inp').nth(1).fill('Jo Parker'); sheet(org).locator('button', has_text='Save').last.click(); time.sleep(0.3)
    wait_for(lambda: any(pl.get('name') == 'Jo Parker' for pl in state(o2)['events'][0]['players']), 'owner\'s roster edit reaches the second organizer', 40)
    o2.evaluate("location.hash = '#/e/%s/players'" % evid); o2.wait_for_selector('text=Import list')
    o2.click('text=Add player'); sheet(o2).locator('input.inp').nth(0).fill('22'); sheet(o2).locator('input.inp').nth(1).fill('Two Added')
    sheet(o2).locator('button', has_text='Save').last.click(); o2.wait_for_selector('text=Two Added')
    wait_for(lambda: any(pl.get('name') == 'Two Added' for pl in state(org)['events'][0]['players']), 'second organizer\'s new player reaches the owner', 40)
    assert any(pl.get('name') == 'Jo Parker' for pl in state(org)['events'][0]['players']), 'both edits kept'
    wait_for(lambda: any(pl.get('name') == 'Two Added' for pl in state(e1)['events'][0]['players']), 'and the evaluators', 40)
    # t32: the second organizer (not the owner) adds a third organizer, who joins; then removes them
    o2.evaluate("location.hash = '#/e/%s/players'" % evid); o2.wait_for_selector('text=Import list')
    o2.click('text=Evaluators · ' + code); o2.wait_for_selector('text=Add an organizer')
    assert o2.locator('.sheet button', has_text='Stop sharing').count() == 1, 'every organizer can stop sharing'
    o2.locator('.sheet button', has_text='Add an organizer').click(); o2.wait_for_selector('.jcode8')
    inv3 = o2.locator('.jcode8').inner_text().replace('\n', '').replace(' ', ''); assert len(inv3) == 8, inv3
    time.sleep(0.7); o2.screenshot(path='test/multi-8-organizer-invites.png')
    o2.locator('.sheet button', has_text='Done').last.click(); time.sleep(0.3)
    if o2.locator('.sheet').count(): o2.locator('.sheet button', has_text='Done').last.click(); time.sleep(0.3)
    c3 = b.new_context(**phone); c3.add_init_script("localStorage.setItem('rp.notips','1')"); o3 = c3.new_page()
    o3.on('pageerror', lambda e: errs.append('o3: ' + str(e)))
    o3.goto(URL + 'j/' + inv3); o3.wait_for_selector('input.jinp'); sheet(o3).locator('input.inp').nth(1).fill('Coach Three'); sheet(o3).locator('button', has_text='Join').click()
    wait_for(lambda: (state(o3) or {}).get('events') and any(pl.get('notes') == 'secret note' for pl in state(o3)['events'][0]['players']), 'third organizer (invited by the second) gets the full event', 40)
    o2.click('text=Evaluators · ' + code); o2.wait_for_selector('text=Coach Three')
    assert o2.locator('button[aria-label="Remove Coach Two"]').count() == 0, 'no remove button on your own row'
    o2.locator('text=Organizers').last.scroll_into_view_if_needed(); time.sleep(0.6); o2.screenshot(path='test/multi-9-organizers-list.png'); print('owner id on o2:', o2.evaluate('window.__rp.S.events[0].ownerId'), 'owner name:', org.evaluate('window.__rp.S.settings.me && window.__rp.S.settings.me.name')); print('owner row:', o2.locator('.sheet .krow').filter(has_text='Started sharing').inner_text().replace(chr(10), ' | '))
    assert 'Organizer A (started sharing)' not in o2.inner_text('.sheet') and 'Coach Two (started sharing)' not in o2.inner_text('.sheet')
    o2.locator('button[aria-label="Remove Coach Three"]').click(); o2.locator('.sheet button', has_text='Remove').last.click(); time.sleep(0.5)
    o3.evaluate("window.__rp.syncEvent(window.__rp.S.events[0])"); wait_for(lambda: state(o3)['events'][0]['share'].get('removed'), 'the second organizer removed the third', 40)
    o2.locator('.sheet button', has_text='Done').last.click(); time.sleep(0.3)
    c3.close()
    org.evaluate("location.hash = '#/e/%s/players'" % evid); org.wait_for_selector('text=Import list')
    org.click('text=Evaluators · ' + code); org.wait_for_selector('text=Coach Two')
    org.locator('button[aria-label="Remove Coach Two"]').click(); org.locator('.sheet button', has_text='Remove').last.click(); time.sleep(0.5)
    org.locator('.sheet button', has_text='Done').last.click()
    wait_for(lambda: state(o2)['events'][0]['share'].get('removed'), 'second organizer told they were removed', 40)

    # finish the event: evaluator 1 sees scoring closed
    org.evaluate("location.hash = '#/e/%s/players'" % evid); org.wait_for_selector('text=Import list')
    org.click('button[aria-label="Event options"]'); org.locator('.sheet .item', has_text='Finish event').click(); org.locator('.sheet button', has_text='Finish event').last.click()
    org.wait_for_selector('.lockbar')
    wait_for(lambda: state(e1)['events'][0].get('locked'), 'finished flag reached evaluator 1', 40)
    e1.wait_for_selector('.lockbar'); e1.locator('button', has_text='Start scoring').click(); time.sleep(0.4)
    assert e1.locator('.keypad').count() == 0, 'scoring closed on the evaluator phone'
    org.locator('.lockbar button', has_text='Unlock').click(); org.wait_for_selector('.lockbar', state='detached')
    wait_for(lambda: not state(e1)['events'][0].get('locked'), 'unlock reached evaluator 1', 40)

    # remove evaluator 2
    org.click('text=Evaluators · ' + code); org.wait_for_selector('text=Coach B')
    sheet(org).locator('button[aria-label="Remove Coach B"]').click(); org.locator('.sheet button', has_text='Remove').last.click(); time.sleep(1)
    e2.click('text=Start scoring'); e2.wait_for_selector('.keypad'); e2.locator('.key', has_text='9').click(); e2.locator('.key', has_text='Go').click(); e2.wait_for_selector('.srow')
    e2.locator('.srow:has(.sbtns)').nth(0).locator('.sb').nth(2).click()
    e2.click('button[aria-label="Back"]'); e2.click('button[aria-label="Back"]')
    wait_for(lambda: 'Removed by organizer' in e2.inner_text('body'), 'evaluator 2 told they were removed', 40)

    # stop sharing
    org.keyboard.press('Escape'); time.sleep(0.3)
    if org.locator('.sheet').count() == 0: org.click('text=Evaluators · ' + code)
    org.locator('.sheet button', has_text='Stop sharing').first.click(); org.locator('.sheet button', has_text='Stop sharing').last.click()
    org.wait_for_selector('text=Share with evaluators')
    wait_for(lambda: 'stopped sharing' in e1.inner_text('body').lower(), 'evaluator 1 told sharing stopped', 40)
    assert len(state(org)['events'][0]['scores']) >= 5, 'organizer keeps the scores after stopping'
    e1.screenshot(path='test/multi-5-stopped.png')

    bad = [e for e in errs if 'status of 4' not in e]
    print('errors:', bad)
    assert not bad, bad
    print('MULTI OK')
