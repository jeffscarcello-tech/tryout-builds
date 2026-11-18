# Browser run: phone and desktop sizes, service worker, offline reload, console errors.
import sys, time
from playwright.sync_api import sync_playwright
build = sys.argv[1]
res = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for name, vp, mobile in (('phone', {'width': 390, 'height': 844}, True), ('desktop', {'width': 1280, 'height': 860}, False)):
        ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
        pg = ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8787/'); pg.wait_for_selector('#ver')
        assert pg.inner_text('#ver') == build, 'version shown ' + pg.inner_text('#ver')
        pg.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller !== null', timeout=10000) if False else None
        pg.evaluate('navigator.serviceWorker.ready'); pg.reload(); pg.wait_for_selector('#ver')
        ctrl = pg.evaluate('!!navigator.serviceWorker.controller')
        pg.click('text=Check for updates'); time.sleep(4.5); tst = pg.inner_text('#toast')
        pg.screenshot(path=f'test/{name}.png', full_page=True)
        ctx.set_offline(True); pg.reload(); pg.wait_for_selector('#ver'); offline_ok = pg.inner_text('#ver') == build
        pill = pg.inner_text('[data-conn]')
        ctx.set_offline(False)
        over = pg.evaluate('document.documentElement.scrollWidth > window.innerWidth')
        res.append((name, ctrl, offline_ok, pill, tst, over, errs))
        ctx.close()
    b.close()
for r in res: print(r)
assert all(r[1] and r[2] and not r[5] and not r[6] for r in res)
print('BROWSER OK')
