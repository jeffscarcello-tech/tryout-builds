# Browser run of t31: more than one position per player, at phone and desktop sizes.
# Add a player as Setter and Outside, see it on the list, filter Results by each, see a rank in each on the card,
# import "setter/libero", and in hockey a Forward and Goalie gets both skill lists when scoring.
import sys, time
from playwright.sync_api import sync_playwright
URL = 'http://localhost:8787/'; BUILD = sys.argv[1] if len(sys.argv) > 1 else ''
state = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('rp.v1'))")
def run(p, name, vp, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('rp.notips','1')"); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    sheet = lambda: pg.locator('.sheet').last
    pg.goto(URL); pg.wait_for_selector('text=New event')
    if BUILD: assert BUILD in pg.content()
    pg.evaluate("""() => { const r = window.__rp; const f = r.formFromSport('volleyball'); const e = r.newEvent('Positions test', 'volleyball', f);
      e.players = [{ id: 'pb', num: '2', name: 'Bea Setter', pos: 'Setter', div: '', group: '', notes: '' }, { id: 'pc', num: '3', name: 'Cal Outside', pos: 'Outside', div: '', group: '' , notes: ''}]; r.render(); }""")
    ev_id = pg.evaluate("window.__rp.S.events.find(e => e.name === 'Positions test').id")
    state = lambda pg: pg.evaluate("window.__rp.S")
    pg.evaluate("location.hash = '#/e/%s/players'" % ev_id); pg.wait_for_selector('text=Bea Setter')
    # add a player with two positions
    pg.locator('button', has_text='Add player').first.click(); pg.wait_for_selector('.sheet .field')
    sheet().locator('input.inp').nth(0).fill('7'); sheet().locator('input.inp').nth(1).fill('Ava Both')
    assert 'tap all that apply' in sheet().inner_text().lower()
    sheet().locator('.chip', has_text='Setter').click(); sheet().locator('.chip', has_text='Outside').click()
    sheet().locator('.chip', has_text='Libero').click(); sheet().locator('.chip', has_text='Libero').click()   # on then off again
    assert sheet().locator('.chip.on').count() == 2; time.sleep(0.3); pg.screenshot(path=f'test/t31-{name}-1-pick.png')
    sheet().locator('button', has_text='Save').last.click(); pg.wait_for_selector('text=Ava Both')
    pl = [x for x in [e for e in state(pg)['events'] if e['id'] == ev_id][0]['players'] if x['name'] == 'Ava Both'][0]
    assert pl['pos'] == 'Setter, Outside', pl['pos']
    assert 'Setter, Outside' in pg.locator('.prow2', has_text='Ava Both').inner_text()
    # order follows the form, whichever was tapped first
    pg.locator('.prow2', has_text='Ava Both').click(); pg.wait_for_selector('text=Edit'); pg.locator('button', has_text='Edit').first.click(); pg.wait_for_selector('.sheet .chip.on')
    assert sheet().locator('.chip.on').count() == 2
    sheet().locator('button', has_text='Save').last.click(); time.sleep(0.3)
    # scores, then Results filters and card ranks
    pg.evaluate("""(id) => { const r = window.__rp, e = r.S.events.find(x => x.id === id); r.ensureDays(e); const sid = e.sessions[0].id;
      for (const [pid, v] of [['pb', 3], ['pc', 4]]) for (const k of e.form.skills) r.setScore(e, pid, k.id, sid, v);
      const a = e.players.find(p => p.name === 'Ava Both'); for (const k of e.form.skills) r.setScore(e, a.id, k.id, sid, 5); r.render(); }""", ev_id)
    pg.evaluate("location.hash = '#/e/%s/results'" % ev_id); pg.wait_for_selector('.rrow')
    sel = pg.locator('select').filter(has=pg.locator('option', has_text='All positions'))
    sel.select_option('Outside'); time.sleep(0.3); names = pg.locator('.rrow').all_inner_texts()
    assert any('Ava Both' in t for t in names) and any('Cal Outside' in t for t in names) and not any('Bea Setter' in t for t in names), names
    sel.select_option('Setter'); time.sleep(0.3); names = pg.locator('.rrow').all_inner_texts()
    assert any('Ava Both' in t for t in names) and any('Bea Setter' in t for t in names) and not any('Cal Outside' in t for t in names), names
    pg.locator('.rrow', has_text='Ava Both').click(); pg.wait_for_selector('text=How they were scored')
    card = pg.inner_text('body'); assert '1st of 2' in card or 'Setters' in card
    assert 'Setters' in card and 'Outsides' in card, 'a rank chip for each position'
    pg.screenshot(path=f'test/t31-{name}-2-card.png')
    # import with a slash
    pg.evaluate("location.hash = '#/e/%s/players'" % ev_id); pg.wait_for_selector('text=Import list')
    pg.locator('button', has_text='Import list').click(); pg.wait_for_selector('.sheet textarea')
    sheet().locator('textarea').fill('Number,Name,Position\n9,Dee Two,setter/libero'); pg.wait_for_selector('.preview')
    assert 'Setter, Libero' in sheet().inner_text(); sheet().locator('button', has_text='Import').last.click(); pg.wait_for_selector('text=Dee Two')
    assert 'Setter, Libero' in pg.locator('.prow2', has_text='Dee Two').inner_text()
    # hockey: forward and goalie gets both lists
    pg.evaluate("""() => { const r = window.__rp; const f = r.formFromSport('hockey'); const e = r.newEvent('Hockey both', 'hockey', f);
      e.players = [{ id: 'hg', num: '30', name: 'Gus Both', pos: 'Forward, Goalie', div: '', group: '', notes: '' }]; r.ensureDays(e); r.S.settings.me = r.S.settings.me || { id: 'vt', name: 'Coach T' }; if (!r.S.settings.me.name) r.S.settings.me.name = 'Coach T'; r.render(); window.__hk = e.id + '/' + e.sessions[0].id; }""")
    hk = pg.evaluate('window.__hk'); f = pg.evaluate("window.__rp.formFromSport('hockey')")
    pg.evaluate("location.hash = '#/s/%s/all/hg'" % hk); time.sleep(0.8)
    txt = pg.inner_text('body')
    assert f['alt']['skills'][0]['name'] in txt and f['skills'][0]['name'] in txt, 'both skill lists on the scoring screen'
    pg.screenshot(path=f'test/t31-{name}-3-hockey.png')
    b.close(); assert not errs, errs; print(name, 'ok')
with sync_playwright() as p:
    run(p, 'phone', {'width': 390, 'height': 844}, True); run(p, 'desktop', {'width': 1280, 'height': 900}, False)
print('T31 OK')
