# Browser run of t21 at phone and desktop sizes: copy an event, results grid (+ PDF), coach comparison,
# finish and unlock, bright light mode, Excel roster import.
import sys, time, os
from playwright.sync_api import sync_playwright
import openpyxl

URL = 'http://localhost:8787/'
BUILD = sys.argv[1] if len(sys.argv) > 1 else ''
XLSX = '/tmp/roster-test.xlsx'
wb = openpyxl.Workbook(); ws = wb.active
for r in [['Number', 'Name', 'Position', 'Group'], [3, 'Xena Q', 'Setter', 'Group A'], [21, 'Yara W', 'Libero', 'Group B'], [8, 'Zoe E', 'Middle', '']]: ws.append(r)
wb.save(XLSX)

def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('rp.notips','1')")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    shot = lambda n: pg.screenshot(path=f'test/t21-{name}-{n}.png')
    sheet = lambda: pg.locator('.sheet').last
    st = lambda: pg.evaluate("JSON.parse(localStorage.getItem('rp.v1'))")
    pg.goto(URL + '#/demo'); pg.wait_for_selector('.rrow')
    if BUILD: assert BUILD in pg.content()
    eid = pg.evaluate("window.__rp.S.events.find(e => e.demo).id")

    # results grid
    pg.locator('button', has_text='Results grid').click(); pg.wait_for_selector('.rpgrid')
    assert pg.locator('.rpgrid tbody tr').count() == 16; shot('1-grid')
    pg.locator('button[aria-label="Save as PDF"]').click(); pg.wait_for_selector('.paper')
    assert 'results grid' in pg.inner_text('.paper')
    with pg.expect_download() as d: pg.locator('button', has_text='Save as PDF').first.click()
    assert d.value.suggested_filename.endswith('-grid.pdf')
    pg.goto(URL + '#/e/' + eid + '/results'); pg.wait_for_selector('.rrow')

    # coach comparison
    pg.locator('button', has_text='Coach comparison').click(); pg.wait_for_selector('.coach')
    assert pg.locator('.coach').count() == 3; pg.locator('.coach summary').first.click(); time.sleep(0.2)
    assert pg.locator('.coach[open] .cskills .row').count() >= 5; shot('2-coaches')
    pg.goto(URL + '#/e/' + eid + '/players'); pg.wait_for_selector('text=Import list')

    # finish and unlock
    pg.click('button[aria-label="Event options"]'); sheet().locator('.item', has_text='Finish event').click(); sheet().locator('button', has_text='Finish event').click()
    pg.wait_for_selector('.lockbar'); assert pg.locator('button', has_text='Start scoring').count() == 0; shot('3-finished')
    pg.goto(URL + '#/s/' + eid + '/' + st()['events'][0]['sessions'][0]['id'] + '/all'); time.sleep(0.4)
    pg.goto(URL + '#/e/' + eid + '/players'); pg.wait_for_selector('.lockbar')
    pg.locator('.lockbar button', has_text='Unlock').click(); pg.wait_for_selector('button:has-text("Start scoring")')

    # copy the event
    pg.click('button[aria-label="Event options"]'); sheet().locator('.item', has_text='Copy this event').click(); pg.wait_for_selector('text=Copy this event')
    sheet().locator('input.inp').fill('Next season'); sheet().locator('button', has_text='Copy').last.click()
    pg.wait_for_selector('text=Next season')
    for _ in range(20):
        ne = [e for e in st()['events'] if e['name'] == 'Next season']
        if ne: break
        time.sleep(0.3)
    ne = ne[0]
    assert len(ne['players']) == 16 and not ne.get('scores') and len(ne['groups']) == 2 and not ne.get('demo'), 'copy: roster and groups, no scores'
    assert ne['form']['skills'][0].get('guide'), 'copy keeps score guides'

    # Excel roster import into the copy
    pg.locator('button', has_text='Import list').click(); pg.wait_for_selector('.sheet textarea')
    sheet().locator('input[type=file]').set_input_files(XLSX); pg.wait_for_selector('.preview')
    t = sheet().inner_text(); assert 'Xena Q' in t and 'Yara W' in t and 'Zoe E' in t, t
    shot('4-xlsx'); sheet().locator('button', has_text='Import').last.click(); time.sleep(1.5)
    ne = [e for e in st()['events'] if e['name'] == 'Next season'][0]; assert len(ne['players']) == 19
    assert any(p['name'] == 'Xena Q' and p['num'] == '3' and p['pos'] == 'Setter' for p in ne['players'])

    # bright light mode
    pg.goto(URL); pg.wait_for_selector('text=New event')
    pg.locator('.item', has_text='Bright light mode').click(); time.sleep(0.2)
    assert pg.evaluate("document.documentElement.dataset.theme") == 'glare'; shot('5-bright')
    pg.reload(); pg.wait_for_selector('text=New event'); assert pg.evaluate("document.documentElement.dataset.theme") == 'glare', 'stays on'
    pg.goto(URL + '#/e/' + eid + '/results'); pg.wait_for_selector('.rrow'); shot('6-bright-results')
    pg.goto(URL); pg.locator('.item', has_text='Bright light mode').click(); time.sleep(0.2); assert pg.evaluate("document.documentElement.dataset.theme") == ''
    bad = [e for e in errs if 'Failed to load resource' not in e]
    b.close(); return bad

with sync_playwright() as p:
    for name, vp, mobile in (('phone', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1280, 'height': 900}, False)):
        bad = run(p, name, vp, mobile); print(name, 'errors:', bad); assert not bad
print('T21 OK')
