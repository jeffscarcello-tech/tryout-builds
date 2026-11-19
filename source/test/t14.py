# Browser run of t14 at phone and desktop sizes: team decisions (fill from ranking, choices, PDF, card),
# score guides (sample lines, editing, the line under a score, the guide sheet) and the Add to Home Screen guide.
import sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8787/'
BUILD = sys.argv[1] if len(sys.argv) > 1 else ''
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    opts = dict(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    if mobile: opts['user_agent'] = IPHONE
    ctx = b.new_context(**opts); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    shot = lambda n: pg.screenshot(path=f'test/t14-{name}-{n}.png', full_page=True)
    sheet = lambda: pg.locator('.sheet').last
    pg.goto(URL); pg.wait_for_selector('text=New event')
    if BUILD: assert BUILD in pg.inner_text('body')
    # install guide (iPhone at phone size; none on a computer)
    if mobile:
        assert pg.locator('.icard').count() == 1, 'install card on iPhone'
        pg.locator('.icard button', has_text='Show me how').click(); pg.wait_for_selector('.istep')
        assert 'Add to Home Screen' in sheet().inner_text() and 'Safari' in sheet().inner_text()
        shot('1-install'); sheet().locator('button', has_text='Got it').click(); time.sleep(0.3)
        assert pg.locator('.icard').count() == 0, 'install card hidden after Got it'
    else:
        assert pg.locator('.icard').count() == 0
    pg.evaluate("localStorage.setItem('rp.notips','1')"); pg.reload(); pg.wait_for_selector('text=New event')

    # decisions on the demo
    pg.locator('button', has_text='Try the demo').click(); pg.wait_for_selector('.rrow')
    pg.locator('button', has_text='Team decisions').click(); pg.wait_for_selector('.drow')
    assert pg.locator('.drow').count() == 16
    pg.locator('button', has_text='Fill from ranking').click(); pg.wait_for_selector('text=the rest')
    t = sheet().inner_text(); assert '15 players are scored' in t, t
    sheet().locator('button', has_text='Fill').last.click(); time.sleep(0.3)
    chips = ' '.join(pg.locator('.hscroll').inner_text().split())
    assert 'Made team 10' in chips and 'Waitlist 2' in chips and 'Not selected 3' in chips and 'Undecided 1' in chips, chips
    shot('2-decisions')
    first = pg.locator('.drow').first; first.locator('.dchip', has_text='Waitlist').click(); time.sleep(0.2)
    assert 'Made team 9' in ' '.join(pg.locator('.hscroll').inner_text().split())
    first.locator('.dchip', has_text='Waitlist').click(); time.sleep(0.2)
    assert 'Undecided 2' in ' '.join(pg.locator('.hscroll').inner_text().split()), 'tapping the chosen outcome again clears it'
    pg.locator('button', has_text='Fill from ranking').click(); sheet().locator('button', has_text='Fill').last.click(); time.sleep(0.3)
    assert 'Made team 10' in ' '.join(pg.locator('.hscroll').inner_text().split()), 'keep decisions: fills only the undecided'
    pg.locator('.hscroll .chip', has_text='Waitlist').click(); assert pg.locator('.drow').count() == 2
    pg.locator('.hscroll .chip', has_text='Everyone').click()
    pg.locator('button', has_text='Save as PDF').click(); pg.wait_for_selector('.paper')
    paper = pg.inner_text('.paper'); assert 'Made team (10)' in paper and 'Waitlist (2)' in paper and '%' not in paper
    with pg.expect_download() as d: pg.locator('button', has_text='Save as PDF').first.click()
    assert d.value.suggested_filename.endswith('-decisions.pdf')
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.drow')
    pg.locator('button', has_text='Choices').click(); sheet().locator('.chip', has_text='Camp tracks').click()
    pg.locator('.sheet button', has_text='Use Camp tracks').click(); time.sleep(0.3)
    assert 'Advanced' in sheet().inner_text(); sheet().locator('button', has_text='Done').click()
    assert 'Undecided 16' in ' '.join(pg.locator('.hscroll').inner_text().split()), 'old decisions no longer count'
    pg.locator('button', has_text='Fill from ranking').click(); sheet().locator('button', has_text='Fill').last.click(); time.sleep(0.3)
    assert 'Advanced 10' in ' '.join(pg.locator('.hscroll').inner_text().split())
    assert pg.locator('.spcard').count() == 0, 'no ShotPulse card for volleyball (ShotPulse does not cover it)'
    pg.evaluate("window.__rp.S.events.find(e => e.demo).sport = 'hockey'; window.__rp.render()"); pg.wait_for_selector('.spcard')
    assert 'Track their season' in pg.inner_text('.spcard') and pg.locator('.spcard a[href="https://shotpulse.app"]').count() == 1
    shot('2b-shotpulse-card')
    pg.locator('.spcard button[aria-label="Hide"]').click(); assert pg.locator('.spcard').count() == 0
    pg.evaluate("window.__rp.S.events.find(e => e.demo).sport = 'volleyball'; window.__rp.render()"); time.sleep(0.2)
    pg.locator('.drow-top').first.click(); pg.wait_for_selector('text=How they were scored')
    assert pg.locator('.dchip.on', has_text='Advanced').count() == 1, 'decision on the player card'
    pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.drow'); pg.click('button[aria-label="Back"]'); pg.wait_for_selector('.rrow')
    assert pg.locator('.rrow .dbadge').count() >= 10, 'decision badges in results'
    shot('3-results-badges')

    # score guides
    pg.locator('.seg button', has_text='Form').click(); pg.wait_for_selector('text=Score guides')
    assert 'sample' in pg.locator('.krow', has_text='Every skill').inner_text()
    pg.locator('button.krow', has_text='Serving').click(); pg.wait_for_selector('.grow2.edit')
    sheet().locator('input').nth(1).fill('Serves tough and on target'); sheet().locator('button', has_text='Save').click(); time.sleep(0.2)
    shot('4-guides-form')
    pg.locator('.seg button', has_text='Players').click(); pg.locator('button', has_text='Start scoring').click()
    if pg.locator('.sheet input.inp').count(): sheet().locator('input.inp').fill('Coach J'); sheet().locator('button', has_text='Start scoring').click()
    sheet().locator('.item', has_text='Group A').click(); pg.wait_for_selector('.subtabs')
    pg.locator('.seg button', has_text='By name').click(); pg.locator('.prow2', has_text='Ava M').click(); pg.wait_for_selector('.srow')
    row = pg.locator('.srow', has_text='Serving').first
    row.locator('.sb', has_text='4').click(); time.sleep(0.2)
    row = pg.locator('.srow', has_text='Serving').first
    assert 'Serves tough and on target' in row.locator('.gline').inner_text(), 'guide line under the score'
    pg.locator('.srow', has_text='Blocking').first.locator('.sb', has_text='2').click(); time.sleep(0.2)
    assert 'Learning' in pg.locator('.srow', has_text='Blocking').first.locator('.gline').inner_text(), 'general guide for other skills'
    pg.locator('button[aria-label="Serving score guide"]').click(); pg.wait_for_selector('.glist')
    assert 'Misses most serves' in sheet().inner_text(); shot('5-guide-sheet'); sheet().locator('button', has_text='Got it').click()
    pg.locator('button[aria-label="Home"]').click(); pg.wait_for_selector('text=New event')
    assert pg.locator('a.item[href="https://shotpulse.app"]').count() == 1, 'ShotPulse in Home, More'
    pg.goto(URL + 'about'); pg.wait_for_selector('.sp'); assert 'Track the season' in pg.inner_text('.sp') and 'From the maker of' in pg.inner_text('.maker')
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    pg.locator('.sp').scroll_into_view_if_needed(); shot('6-about-shotpulse')
    bad = [e for e in errs if 'Failed to load resource' not in e]
    b.close(); return bad

with sync_playwright() as p:
    for name, vp, mobile in (('phone', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1280, 'height': 900}, False)):
        bad = run(p, name, vp, mobile); print(name, 'errors:', bad); assert not bad
print('T14 OK')
