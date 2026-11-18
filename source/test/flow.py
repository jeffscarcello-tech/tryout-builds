# Browser run of the stage 1 screens at phone and desktop sizes:
# new event, paste roster, groups, form editing, templates, reload, offline, sport words.
import sys, time, json
from playwright.sync_api import sync_playwright

BUILD = sys.argv[1]
URL = 'http://localhost:8787/'
results = []

def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    shot = lambda n: pg.screenshot(path=f'test/{name}-{n}.png', full_page=True)
    sheet = lambda: pg.locator('.sheet').last
    pg.goto(URL); pg.wait_for_selector('text=New event')
    assert BUILD in pg.inner_text('body'), 'version not shown'
    shot('1-home')
    # new event: volleyball
    pg.click('text=New event'); sheet().locator('input.inp').fill('U15 girls tryouts')
    sheet().locator('button.chip', has_text='Volleyball').click(); shot('2-new')
    sheet().locator('text=Create event').click(); pg.wait_for_selector('text=Import list')
    # paste roster with header and groups
    pg.click('text=Import list')
    sheet().locator('textarea').fill('Number,Name,Position,Division,Group\n12,Sam L,Setter,U15,Group A\n7,Jordan P,Libero,U15,Group A\n3,Ava C,Outside,U15,Group B\n12,Mia R,Middle,U15,Group A\n22,Kai W,Opposite,U15,')
    time.sleep(0.5); assert '5 players' in sheet().inner_text().lower(), 'preview count'
    shot('3-import'); sheet().locator('button', has_text='Import').last.click()
    pg.wait_for_selector('text=Sam L'); body = pg.inner_text('body')
    assert 'Some numbers are used twice' in body, 'duplicate warning'
    assert pg.locator('.jn.dup').count() == 2, 'two dup badges'
    shot('4-players')
    # fix the duplicate: edit Mia to 14
    pg.locator('.prow2', has_text='Mia R').click(); num = sheet().locator('input.inp').first; num.fill('14')
    sheet().locator('button', has_text='Save').last.click(); time.sleep(0.2)
    assert pg.locator('.jn.dup').count() == 0, 'dup fixed'
    # add a player by hand
    pg.click('text=Add player'); sheet().locator('input.inp').nth(0).fill('5'); sheet().locator('input.inp').nth(1).fill('Lee T')
    sheet().locator('button.chip', has_text='Setter').click(); sheet().locator('button', has_text='Save').last.click()
    pg.wait_for_selector('text=Lee T')
    # groups: split unassigned evenly
    pg.locator('.seg button', has_text='Groups').click(); pg.wait_for_selector('text=Add group')
    assert 'Group A' in pg.inner_text('body') and 'Group B' in pg.inner_text('body'), 'groups created by import'
    pg.click('text=Split 2 evenly'); time.sleep(0.2)
    assert 'not in a group' not in pg.inner_text('body'), 'all assigned'
    shot('5-groups')
    # form: rename, weight, reorder, remove+undo, add skill, add test, scale
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Measured tests')
    assert 'Gameplay' in pg.inner_text('body')
    pg.locator('.krow', has_text='Passing').locator('.wt').click(); assert pg.locator('.krow', has_text='Passing').locator('.wt').inner_text() == '×2'
    pg.locator('.krow', has_text='Setting').locator('button[aria-label="Move up"]').click()
    names = [x.inner_text() for x in pg.locator('.krow .knm').all()][:3]
    assert names[1] == 'Setting', names
    pg.locator('.krow', has_text='Digging').locator('button[aria-label="Remove"]').click(); assert 'Digging' not in pg.locator('.list').first.inner_text()
    pg.click('.toast .tbtn'); time.sleep(0.2); assert 'Digging' in pg.inner_text('body'), 'undo remove'
    pg.click('text=Add skill'); sheet().locator('input.inp').fill('Serve receive'); sheet().locator('button', has_text='Add').last.click(); pg.wait_for_selector('text=Serve receive')
    pg.click('text=Add test'); sheet().locator('input.inp').nth(0).fill('Block jump'); sheet().locator('input.inp').nth(1).fill('cm')
    sheet().locator('button.chip', has_text='Higher').click(); sheet().locator('button', has_text='Save').last.click(); pg.wait_for_selector('text=Block jump')
    pg.locator('.seg button', has_text='1 to 10').click()
    pg.locator('button.chip', has_text='+ U13').click() if pg.locator('button.chip', has_text='+ U13').count() else None
    shot('6-form')
    # scoring on this phone
    pg.locator('.seg button', has_text='Players').click(); pg.wait_for_selector('text=Start scoring'); pg.click('text=Start scoring')
    sheet().locator('input.inp').fill('Coach J'); sheet().locator('button', has_text='Start scoring').click()
    sheet().locator('.item', has_text='Group A').click(); pg.wait_for_selector('.keypad')
    shot('8-numbers')
    pg.locator('.key', has_text='9').click(); pg.wait_for_selector('.numshow.bad')   # nobody is #9
    pg.locator('.key', has_text='C').click(); pg.locator('.key', has_text='7').click()
    pg.wait_for_selector('.srow'); assert 'Jordan P' in pg.inner_text('header')
    rows = pg.locator('.srow:has(.sbtns)'); nrows = rows.count(); assert nrows == 10, nrows
    for i in range(nrows): rows.nth(i).locator('.sb').nth(i % 10).click()
    assert pg.locator('.sb.on').count() == nrows
    rows.nth(0).locator('.sb').nth(0).click(); assert pg.locator('.sb.on').count() == nrows - 1, 'tap again clears'
    rows.nth(0).locator('.sb').nth(6).click()
    tests = pg.locator('.srow input.inp')
    for i in range(tests.count()): tests.nth(i).fill(str(40 + i)); tests.nth(i).press('Tab'); time.sleep(0.1)
    pg.locator('textarea.inp').fill('Great hands'); pg.locator('.sname').first.click()
    assert '13/13' in pg.inner_text('header'), pg.inner_text('header')
    shot('9-score')
    pg.locator('button', has_text='Next: #').click(); pg.wait_for_selector('.srow'); assert 'Jordan P' not in pg.inner_text('header')
    pg.click('text=All numbers'); pg.wait_for_selector('.ntile.full'); assert pg.locator('.ntile.full').count() == 1
    pg.reload(); pg.wait_for_selector('.ntile.full')
    pg.locator('.ntile', has_text='7').click(); assert pg.locator('textarea.inp').input_value() == 'Great hands'
    pg.goto(URL + '#/'); pg.locator('.evcard', has_text='U15 girls').click(); pg.wait_for_selector('.pbadge.full')
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Save as my template')
    # save as template, then new event from it
    pg.click('text=Save as my template'); sheet().locator('input.inp').fill('My VB form'); sheet().locator('button', has_text='Save').last.click(); time.sleep(0.3)
    # reload: everything still there
    pg.reload(); pg.wait_for_selector('text=Serve receive'); assert pg.locator('.seg button.on', has_text='1 to 10').count() == 1, 'scale kept'
    pg.goto(URL + '#/'); pg.wait_for_selector('text=U15 girls tryouts'); assert '6 players' in pg.inner_text('body'), pg.inner_text('body')
    pg.click('text=New event'); sheet().locator('button.chip', has_text='My VB form').click(); sheet().locator('input.inp').fill('Spring camp')
    sheet().locator('text=Create event').click(); pg.wait_for_selector('text=Import list')
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Serve receive'); assert pg.locator('.seg button.on', has_text='1 to 10').count() == 1, 'template scale'
    # hockey: goalie list
    pg.goto(URL + '#/'); pg.click('text=New event'); sheet().locator('button.chip', has_text='Hockey').click(); sheet().locator('text=Create event').click()
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Goalie skills')
    # swimming words
    pg.goto(URL + '#/'); pg.click('text=New event'); sheet().locator('button.chip', has_text='Swimming').click(); sheet().locator('text=Create event').click()
    pg.wait_for_selector('text=Add swimmer'); assert pg.locator('.seg button', has_text='Swimmers').count() == 1
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Strokes')
    shot('7-swim-form')
    # templates page
    pg.goto(URL + '#/templates'); pg.wait_for_selector('text=My VB form')
    # offline reload
    pg.goto(URL + '#/'); pg.evaluate('navigator.serviceWorker.ready'); pg.reload(); pg.wait_for_selector('text=New event')
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector('text=U15 girls tryouts'); off = 'Offline' in pg.inner_text('header')
    ctx.set_offline(False)
    over = pg.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    # delete an event
    pg.locator('.evcard', has_text='Spring camp').click(); pg.click('button[aria-label="Event options"]'); sheet().locator('text=Delete event').click()
    pg.locator('.sheet').last.locator('button', has_text='Delete').click(); pg.wait_for_selector('text=Your events'); assert 'Spring camp' not in pg.inner_text('body')
    data = json.loads(pg.evaluate("localStorage.getItem('rp.v1')"))
    results.append((name, len(data['events']), len(data['templates']), off, over, errs))
    b.close()

with sync_playwright() as p:
    run(p, 'phone', {'width': 390, 'height': 844}, True)
    run(p, 'desktop', {'width': 1280, 'height': 860}, False)
for r in results: print(r)
assert all(r[1] == 3 and r[2] == 1 and r[3] and not r[4] and not r[5] for r in results)
print('FLOW OK')
