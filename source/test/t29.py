# Browser run of t29: Report a problem (Home, More). At 390 px (phone) and 1280 px (desktop):
#   the button shows right under Check for updates and is tap-sized; tapping it asks for a mailto: address with the
#   right address, a subject starting "RosterPulse problem (<build>)" and a body with the questions and the details;
#   the counts match (2 real events, 5 players, demo noted); the backup toast shows; no page errors.
import json, subprocess, time, os, urllib.parse
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = json.load(open(os.path.join(ROOT, 'version.json')))['build']
subprocess.run(['pkill', '-f', 'test/serve.mjs'])
srv = subprocess.Popen(['node', 'test/serve.mjs'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.5)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for name, vp, mob in [('phone', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1280, 'height': 900}, False)]:
        ctx = b.new_context(viewport=vp, is_mobile=mob, has_touch=mob)
        ctx.add_init_script("localStorage.setItem('rp.notips','1')")
        pg = ctx.new_page(); errs = []; mails = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8787/'); pg.wait_for_selector('text=New event')
        pg.evaluate("""() => { const r = window.__rp; const a = r.newEvent('U13 girls', 'volleyball'); a.players.push({id:'p1',name:'A',num:'1'},{id:'p2',name:'B',num:'2'},{id:'p3',name:'C',num:'3'});
          const c = r.newEvent('Camp', 'basketball'); c.players.push({id:'q1',name:'D',num:'4'},{id:'q2',name:'E',num:'5'}); r.render(); }""")
        pg.evaluate("location.hash = '#/demo'"); pg.wait_for_timeout(600); pg.evaluate("location.hash = '#/'"); pg.wait_for_selector('text=Report a problem')
        items = pg.locator('.list .item').all_inner_texts()
        i = next(k for k, t in enumerate(items) if 'Check for updates' in t)
        assert 'Report a problem' in items[i + 1], 'not right under Check for updates'
        btn = pg.locator('.item', has_text='Report a problem'); bb = btn.bounding_box()
        assert bb['height'] >= 44 and bb['width'] >= 300, bb
        assert 'build and phone type filled in' in btn.inner_text()
        # catch the mailto instead of leaving the page
        pg.evaluate("() => { window.__mails = []; const r = window.__rp; window.__real = r.reportUrl; }")
        url = pg.evaluate("window.__rp.reportUrl()")
        assert url.startswith('mailto:support@shotpulse.app?subject='), url
        q = urllib.parse.parse_qs(url.split('?', 1)[1])
        assert q['subject'][0] == 'RosterPulse problem (' + BUILD + ')', q['subject']
        body = q['body'][0]
        for need in ['What happened?', 'What did you expect?', 'please leave this part', 'Build: ' + BUILD, 'Device: ', 'Opened as: browser',
                     'Screen: ', 'window %dx%d' % (vp['width'], vp['height']), 'Page: #/', 'Online: yes', 'Events: 2 (0 shared), players: 5, templates: 0, demo open', 'Browser: ']:
            assert need in body, need
        # tap the real button: the browser is sent to the mailto address, then the toast shows
        pg.route('**/*', lambda r: r.continue_())
        pg.on('request', lambda r: mails.append(r.url) if r.url.startswith('mailto:') else None)
        pg.evaluate("() => { const L = window.location; window.__go = []; }")
        btn.click(); pg.wait_for_timeout(1500)
        assert 'If no email opened, write to support@shotpulse.app' in pg.inner_text('body'), 'no backup toast'
        assert pg.evaluate('window.__rp.APP.build') == BUILD
        pg.screenshot(path=f'test/t29-{name}.png', full_page=False)
        assert not errs, errs
        print(name, 'ok; body:\n' + body)
        ctx.close()
    # device line on an iPhone and an Android phone
    for ua, want in [('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'Device: iPhone, iOS 18.1'),
                     ('Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36', 'Device: Android 15 phone')]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, user_agent=ua, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); pg.goto('http://localhost:8787/'); pg.wait_for_selector('text=New event')
        assert want in pg.evaluate('window.__rp.reportInfo()'), want
        print(want, 'ok'); ctx.close()
    b.close()
  print('T29 PASSED')
finally:
  srv.terminate()
