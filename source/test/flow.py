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
    ctx.add_init_script("localStorage.setItem('rp.notips','1')")
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
    pg.locator('.prow2', has_text='Mia R').click(); pg.wait_for_selector('.pinfo')
    assert 'Nobody has scored' in pg.inner_text('main'), 'player screen before scoring'
    pg.click('button[aria-label="Edit details"]'); num = sheet().locator('input.inp').first; num.fill('14')
    sheet().locator('button', has_text='Save').last.click(); time.sleep(0.2); assert pg.locator('.pinfo .jn').inner_text() == '14'
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=Import list')
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
    assert pg.locator('.prow2').count() == 0, 'number mode shows only the keypad'
    shot('8-numbers')
    pg.locator('.key', has_text='9').click(); pg.wait_for_selector('.numshow.bad'); pg.wait_for_selector('.nomatch')   # nobody is #9: big warning at once
    assert 'No #9' in pg.inner_text('.nomatch'); shot('8b-nomatch')
    pg.locator('.numclr').click(); pg.locator('.key', has_text='1').click()
    assert pg.locator('.matchbox .prow2').count() == 2 and not pg.locator('.numshow.bad').count(), '1 is a prefix of 12 and 14: both shown, nothing opens'
    assert pg.locator('.keypad').count() == 1
    pg.locator('.key', has_text='Go').click(); pg.wait_for_selector('.nomatch'); assert 'No #1' in pg.inner_text('.nomatch'), 'Go with no #1 warns'
    pg.locator('.key', has_text='4').click(); assert not pg.locator('.nomatch').count()
    assert pg.locator('.matchbox .prow2.exact').count() == 1 and 'Mia R' in pg.inner_text('.matchbox'), '#14 shown, not opened'
    pg.locator('.numclr').click(); pg.locator('.key', has_text='3').click(); pg.wait_for_selector('.nomatch')
    assert 'No #3 in Group A' in pg.inner_text('.nomatch') and 'is in Group B' in pg.inner_text('.nomatch') and pg.locator('.nomatch button', has_text='anyway').count() == 1
    pg.keyboard.press('Escape'); pg.keyboard.press('7'); time.sleep(0.2); assert pg.locator('.keypad').count() == 1, 'typing does not jump'
    pg.keyboard.press('Enter')   # a keyboard's Enter works like Go
    pg.wait_for_selector('.srow'); assert 'Jordan P' in pg.inner_text('header')
    rows = pg.locator('.srow:has(.sbtns)'); nrows = rows.count(); assert nrows == 10, nrows
    for i in range(nrows): rows.nth(i).locator('.sb').nth(i % 10).click()
    assert pg.locator('.sb.on').count() == nrows
    rows.nth(0).locator('.sb').nth(0).click(); assert pg.locator('.sb.on').count() == nrows - 1, 'tap again clears'
    rows.nth(0).locator('.sb').nth(6).click()
    # note beside a skill
    rows.nth(1).locator('.nbtn').click(); sheet().locator('input.inp').fill('Quick hands'); sheet().locator('button', has_text='Save').click()
    pg.wait_for_selector('.snote'); assert pg.locator('.snote').inner_text() == 'Quick hands'
    rows.nth(1).locator('.nbtn').click(); sheet().locator('button', has_text='Cancel').click(); time.sleep(0.2); assert pg.locator('.snote').count() == 1, 'cancel keeps the note'
    tests = pg.locator('.srow input.inp')
    for i in range(tests.count()): tests.nth(i).fill(str(40 + i)); tests.nth(i).press('Tab'); time.sleep(0.1)
    pg.locator('textarea.inp').fill('Great hands'); pg.locator('.sname').first.click()
    assert '13/13' in pg.inner_text('header'), pg.inner_text('header')
    shot('9-score')
    pg.locator('button', has_text='Next: #').click(); pg.wait_for_function("!document.querySelector('header').innerText.includes('Jordan P')", timeout=5000); pg.wait_for_selector('.srow')
    pg.locator('button', has_text='Next: #').click(); pg.wait_for_selector('.srow')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.keypad'); assert 'Group A' in pg.inner_text('header'), 'Back goes to the list, not the previous player'
    # by name: the full list only
    pg.locator('.seg button', has_text='By name').click(); pg.wait_for_selector('.prow2'); assert pg.locator('.keypad').count() == 0
    names = [x.inner_text() for x in pg.locator('.prow2 .pnm').all()]; assert names == sorted(names) and len(names) == 3, names
    assert pg.locator('.prow2', has_text='Jordan P').locator('.pbadge.full').count() == 1
    shot('10-byname')
    pg.reload(); pg.wait_for_selector('.prow2')   # remembers By name
    pg.locator('.prow2', has_text='Jordan P').click(); assert pg.locator('textarea.inp').input_value() == 'Great hands' and pg.locator('.snote').count() == 1
    # by skill: one skill, every player
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.prow2')
    pg.locator('.seg button', has_text='By skill').click(); pg.wait_for_selector('select[aria-label="Skill"]')
    pg.locator('select[aria-label="Skill"]').select_option(label='Passing'); time.sleep(0.2)
    assert pg.locator('select[aria-label="Skill"]').evaluate('e => e.options[e.selectedIndex].text') == 'Passing', 'skill menu shows the skill being scored'
    rows = pg.locator('.skrow'); assert rows.count() == 3, rows.count()
    assert rows.filter(has_text='Jordan P').locator('.sb.on').count() == 1, 'Jordan already has a passing score'
    rows.filter(has_text='Sam L').locator('.sb').nth(5).click(); rows.filter(has_text='Mia R').locator('.sb').nth(2).click()
    assert pg.locator('.skrow .sb.on').count() == 3 and '3 of 3' in pg.inner_text('main')
    rows.filter(has_text='Sam L').locator('.nbtn').click(); sheet().locator('input.inp').fill('Platform drops'); sheet().locator('button', has_text='Save').click(); pg.wait_for_selector('.skrow .snote')
    shot('15-byskill')
    pg.locator('button', has_text='Next skill:').click(); time.sleep(0.2)
    assert pg.locator('select[aria-label="Skill"] option:checked').inner_text() != 'Passing'
    pg.reload(); pg.wait_for_selector('select[aria-label="Skill"]'); assert pg.locator('.seg button.on', has_text='By skill').count() == 1, 'mode remembered'
    pg.locator('.seg button', has_text='By name').click(); pg.wait_for_selector('.prow2')
    assert pg.locator('.prow2', has_text='Sam L').locator('.pbadge').count() == 1, 'Sam now partly scored'
    # days: add Day 2, carry scores forward
    pg.goto(URL + '#/'); pg.locator('.evcard', has_text='U15 girls').click(); pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Add day')
    pg.click('text=Add day'); pg.wait_for_selector('text=How the days count'); pg.locator('.prow', has_text='Carry scores forward').click()
    # measured tests: imperial switch converts Jordan's values; remove a test with undo
    pg.locator('.seg button', has_text='Imperial').click(); time.sleep(0.2)
    assert pg.locator('.krow', has_text='Vertical jump').locator('.pmeta').inner_text().startswith('in'), 'unit switched'
    ev = [e for e in json.loads(pg.evaluate("localStorage.getItem('rp.v1')"))['events'] if e['name'] == 'U15 girls tryouts'][0]
    vj = [t for t in ev['form']['tests'] if t['name'] == 'Vertical jump'][0]['id']
    vals = [r['v'] for k, r in ev['scores'].items() if k.split('|')[2] == vj]; assert vals == [15.748], vals
    pg.locator('.krow', has_text='Block jump').locator('button[aria-label="Remove"]').click(); assert pg.locator('.krow', has_text='Block jump').count() == 0
    pg.click('.toast .tbtn'); time.sleep(0.2); assert pg.locator('.krow', has_text='Block jump').count() == 1, 'undo remove test'
    pg.locator('.krow', has_text='Approach jump').locator('.knm').click(); sheet().locator('button.chip', has_text='cm').click(); sheet().locator('button', has_text='Save').last.click(); time.sleep(0.2)
    assert pg.locator('.krow', has_text='Approach jump').locator('.pmeta').inner_text().startswith('cm')
    shot('12-tests')
    pg.locator('.seg button', has_text='Players').click(); pg.click('text=Start scoring')
    sheet().locator('button.chip', has_text='Day 2').click(); sheet().locator('.item', has_text='Group A').click()
    pg.wait_for_function("document.querySelector('header').innerText.includes('Day 2')", timeout=5000); pg.wait_for_selector('.prow2')
    assert pg.locator('.prow2', has_text='Jordan P').locator('.pbadge.full').count() == 1, 'carried scores count as done'
    pg.locator('.prow2', has_text='Jordan P').click(); pg.wait_for_selector('.srow')
    assert pg.locator('.sb.carried').count() == 10 and pg.locator('.sb.on').count() == 0, 'day 1 scores carried, faded'
    pg.locator('.srow:has(.sbtns)').nth(0).locator('.sb').nth(2).click(); assert pg.locator('.sb.on').count() == 1 and pg.locator('.sb.carried').count() == 9
    shot('11-day2')
    pg.goto(URL + '#/'); pg.locator('.evcard', has_text='U15 girls').click(); pg.wait_for_selector('.pbadge.full')
    # results tab (first clear Kai's position to test the No position choice)
    pg.locator('.prow2', has_text='Jordan P').click(); pg.wait_for_selector('.pinfo')
    body = pg.inner_text('main'); assert 'Coach J' in body and 'Day 1' in body and 'Day 2' in body and 'avg' in body, body[:500]
    shot('16-player')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=Import list')
    pg.locator('.prow2', has_text='Kai W').click(); pg.wait_for_selector('.pinfo'); pg.click('button[aria-label="Edit details"]')
    sheet().locator('.field', has_text='Position').locator('button.chip', has_text='None').click(); sheet().locator('button', has_text='Save').last.click(); time.sleep(0.2)
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=Import list')
    pg.locator('.seg button', has_text='Results').click(); pg.wait_for_selector('.rrow')
    assert pg.locator('.rrow').count() == 6, pg.locator('.rrow').count()
    cls = [pg.locator('.rrow').nth(i).get_attribute('class') for i in range(6)]; assert cls[:3] == ['rrow'] * 3 and all('none' in c for c in cls[3:]), cls   # 3 scored first
    first = pg.locator('.rrow').first; assert 'Sam L' in first.inner_text(), 'Sam (passing 6 of 10 only) leads on percent'
    pg.locator('select[aria-label="Sort by"]').select_option(label='Serving'); time.sleep(0.2); assert 'Jordan P' in pg.locator('.rrow').first.inner_text() and pg.locator('.rrow:not(.none)').count() == 1, 'only Jordan has Serving'
    pg.locator('select[aria-label="Sort by"]').select_option(label='Overall')
    pg.click('button[aria-label="More spots"]'); time.sleep(0.2); assert pg.locator('b.num').first.inner_text() == '1'; assert pg.locator('.tline').count() == 1, 'team line drawn'; assert pg.evaluate("document.querySelector('.tline').previousElementSibling.innerText").startswith('1'), 'line after the first spot'
    if pg.locator('select[aria-label="All groups"]').count(): pg.locator('select[aria-label="All groups"]').select_option(label='Group B'); time.sleep(0.2); assert 'Jordan P' not in pg.inner_text('.list'); pg.locator('select[aria-label="All groups"]').select_option(value='')
    # position filter: the menu shows the choice, All positions brings everyone back, Show everyone resets
    pos = pg.locator('select[aria-label="All positions"]')
    pos.select_option(label='Setter'); time.sleep(0.2)
    assert pos.evaluate('e => e.options[e.selectedIndex].text') == 'Setter' and pg.locator('.rrow').count() == 2, pg.locator('.rrow').count()
    pg.locator('select[aria-label="All positions"]').select_option(label='All positions'); time.sleep(0.2); assert pg.locator('.rrow').count() == 6, 'All positions = everyone'
    pg.locator('select[aria-label="All positions"]').select_option(label='Libero'); time.sleep(0.2); pg.locator('button', has_text='Show everyone').click(); time.sleep(0.2); assert pg.locator('.rrow').count() == 6
    pg.locator('select[aria-label="All positions"]').select_option(label='No position'); time.sleep(0.2); assert pg.locator('.rrow').count() == 1 and 'Kai W' in pg.locator('.rrow').first.inner_text()
    pg.locator('select[aria-label="All positions"]').select_option(label='All positions'); time.sleep(0.2); assert pg.locator('.rrow').count() == 6, 'Kai back with All positions'
    with pg.expect_download() as dl: pg.locator('button', has_text='Spreadsheet').click()
    csv = open(dl.value.path(), encoding='utf-8-sig').read(); assert csv.startswith('Rank,Number,Name') and 'Jordan P' in csv and 'Quick hands' in csv, csv[:300]
    shot('13-results')
    # compare 2 players
    pg.locator('button', has_text='Compare').first.click(); sheet().locator('.prow2', has_text='Jordan P').click(); sheet().locator('.prow2', has_text='Sam L').click()
    sheet().locator('button', has_text='Compare (2)').click(); pg.wait_for_selector('.ctable')
    assert pg.locator('.chead .cname').count() == 2 and pg.locator('.cval.best').count() >= 1 and 'Serving' in pg.inner_text('main')
    shot('18-compare')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.rrow')
    # missing scores
    pg.locator('button', has_text='Missing scores').click(); pg.wait_for_selector('text=Not scored by anyone')
    body = pg.inner_text('main').lower(); assert 'coach j' in body and 'ava c' in body, body[:400]
    shot('19-missing')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.rrow')
    # print preview + PDF
    pg.locator('button', has_text='Save as PDF').click(); pg.wait_for_selector('.paper')
    assert 'U15 girls tryouts' in pg.inner_text('.paper') and pg.locator('.paper .ptbl tbody tr').count() == 6
    with pg.expect_download() as dl: pg.locator('button', has_text='Save as PDF').click()
    pdfb = open(dl.value.path(), 'rb').read(); assert pdfb[:8] == b'%PDF-1.4' and dl.value.suggested_filename.startswith('RosterPulse-'), dl.value.suggested_filename
    open('test/' + name + '-results.pdf', 'wb').write(pdfb)
    shot('20-print')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.rrow')
    pg.locator('.rrow', has_text='Jordan P').click(); pg.wait_for_selector('.rcard')
    body = pg.inner_text('main'); assert '#1' in body and 'overall' in body.lower() and 'Quick hands' in body and 'Great hands' in body, body[:400]
    assert pg.locator('.bar-row').count() == 10 and pg.locator('.bar-row.strong').count() == 2 and pg.locator('.bar-row.weak').count() == 2
    shot('14-card')
    pg.locator('button', has_text='Save as PDF').click(); pg.wait_for_selector('.paper'); assert 'Skills' in pg.inner_text('.paper') and 'Quick hands' in pg.inner_text('.paper')
    with pg.expect_download() as dl: pg.locator('button', has_text='Save as PDF').click()
    open('test/' + name + '-card.pdf', 'wb').write(open(dl.value.path(), 'rb').read())
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.rcard')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.rrow')
    # scale change keeps scores (convert)
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Measured tests')
    pg.locator('.seg button', has_text='1 to 5').click(); pg.locator('.sheet').last.locator('button', has_text='Convert and change').click(); time.sleep(0.3)
    ev = [e for e in json.loads(pg.evaluate("localStorage.getItem('rp.v1')"))['events'] if e['name'] == 'U15 girls tryouts'][0]
    assert ev['form']['scale'] == '5'; vals = [r['v'] for k, r in ev['scores'].items() if r['v'] is not None and k.split('|')[2] in [x['id'] for x in ev['form']['skills']]]
    assert vals and max(vals) <= 5 and min(vals) >= 1, vals
    pg.locator('.seg button', has_text='1 to 10').click(); pg.locator('.sheet').last.locator('button', has_text='Keep the old scale').click(); time.sleep(0.2)
    assert pg.locator('.seg button.on', has_text='1 to 5').count() == 1, 'keep the old scale = no change'
    # custom scale 0 to 100 with slider, − / + and number box
    pg.locator('.seg button', has_text='Custom').click(); sheet().locator('button.chip', has_text='0').first.click(); sheet().locator('input.inp').fill('100')
    sheet().locator('button', has_text='Use this scale').click(); pg.locator('.sheet').last.locator('button', has_text='Convert and change').click(); time.sleep(0.3)
    assert pg.locator('.seg button.on', has_text='0 to 100').count() == 1
    pg.locator('.seg button', has_text='Players').click(); pg.locator('.prow2', has_text='Sam L').click(); pg.wait_for_selector('.pinfo')
    pg.locator('button', has_text='Score this player').click(); pg.wait_for_selector('.srange')
    srow = pg.locator('.srow', has_text='Serving').first
    srow.locator('button[aria-label$="plus one"]').click(); time.sleep(0.15); srow = pg.locator('.srow', has_text='Serving').first
    assert srow.locator('.snum').input_value() == '50', srow.locator('.snum').input_value()   # empty + starts at the middle
    srow.locator('button[aria-label$="plus one"]').click(); time.sleep(0.15); srow = pg.locator('.srow', has_text='Serving').first; assert srow.locator('.snum').input_value() == '51'
    srow.locator('button[aria-label$="minus one"]').click(); srow = pg.locator('.srow', has_text='Serving').first; srow.locator('button[aria-label$="minus one"]').click(); time.sleep(0.15)
    srow = pg.locator('.srow', has_text='Serving').first; assert srow.locator('.snum').input_value() == '49'
    srow.locator('.snum').fill('120'); srow.locator('.snum').press('Tab'); time.sleep(0.15); srow = pg.locator('.srow', has_text='Serving').first; assert srow.locator('.snum').input_value() == '100', 'clamped to the top'
    srow.locator('.srange').evaluate("e => { e.value = 77; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }"); time.sleep(0.15)
    srow = pg.locator('.srow', has_text='Serving').first; assert srow.locator('.snum').input_value() == '77', 'slider sets the score'
    shot('17-slider')
    srow.locator('button[aria-label$="clear"]').click(); time.sleep(0.15); assert pg.locator('.srow', has_text='Serving').first.locator('.snum').input_value() == ''
    srow = pg.locator('.srow', has_text='Serving').first; srow.locator('.snum').fill('64'); srow.locator('.snum').press('Tab'); time.sleep(0.15)
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.pinfo'); assert '64' in pg.inner_text('main')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('text=Import list')
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Measured tests')
    pg.locator('.seg button', has_text='1 to 5').click(); pg.locator('.sheet').last.locator('button', has_text='Convert and change').click(); time.sleep(0.3)
    assert pg.locator('.seg button.on', has_text='1 to 5').count() == 1
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Save as my template')
    # save as template, then new event from it
    pg.click('text=Save as my template'); sheet().locator('input.inp').fill('My VB form'); sheet().locator('button', has_text='Save').last.click(); time.sleep(0.3)
    # reload: everything still there
    pg.reload(); pg.wait_for_selector('text=Serve receive'); assert pg.locator('.seg button.on', has_text='1 to 5').count() == 1, 'scale kept'
    pg.goto(URL + '#/'); pg.wait_for_selector('text=U15 girls tryouts'); assert '6 players' in pg.inner_text('body'), pg.inner_text('body')
    pg.click('text=New event'); sheet().locator('button.chip', has_text='My VB form').click(); sheet().locator('input.inp').fill('Spring camp')
    sheet().locator('text=Create event').click(); pg.wait_for_selector('text=Import list')
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Serve receive'); assert pg.locator('.seg button.on', has_text='1 to 5').count() == 1, 'template scale'
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
