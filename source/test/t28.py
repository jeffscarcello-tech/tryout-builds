# Browser run of t28: updates really arrive. One browser keeps the app (with its service worker and cache) while the
# server is switched to newer builds, the way a phone sits on an old version:
#   1. same build on the server: Check for updates says latest;
#   2. newer build: Check for updates loads it;
#   3. newer build again, app simply reopened (served from the phone's stored copy): Update now appears and loads it.
# Builds the app three times and restarts test/serve.mjs each time. Ends with the real build back in dist/.
import json, subprocess, sys, time, os, shutil, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'http://localhost:8787/'
VJ = os.path.join(ROOT, 'version.json'); REAL = open(VJ).read()
assert not json.loads(REAL)['build'].startswith(('upd-', 'old-')), 'version.json still holds a test build: fix it first'
server = None

def build(name):
    v = json.loads(REAL); v['build'] = name; v['label'] = 'update test ' + name
    open(VJ, 'w').write(json.dumps(v)); subprocess.run(['python3', 'build.py'], cwd=ROOT, check=True, capture_output=True)
def serve():
    global server
    if server: server.terminate(); server.wait()
    subprocess.run(['pkill', '-f', 'test/serve.mjs'])
    server = subprocess.Popen(['node', 'test/serve.mjs'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.5)
def version_shown(pg): return pg.evaluate('window.__rp && window.__rp.APP.build')
def wait_for(fn, what, secs=25):
    end = time.time() + secs
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.4)
    raise AssertionError('timed out: ' + what)
def check_btn(pg):
    pg.evaluate("location.hash = '#/'"); pg.wait_for_selector('text=Check for updates')
    pg.locator('.item', has_text='Check for updates').click()

def run(p, name, vp, mobile):
    prof = tempfile.mkdtemp()
    ctx = p.chromium.launch_persistent_context(prof, executable_path='/usr/bin/google-chrome', viewport=vp, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script("localStorage.setItem('rp.notips','1')")
    pg = ctx.pages[0] if ctx.pages else ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    build('upd-a1'); serve()
    pg.goto(URL); pg.wait_for_selector('text=New event')
    wait_for(lambda: pg.evaluate('!!navigator.serviceWorker.controller') or (pg.reload() and False), 'service worker in control')
    assert version_shown(pg) == 'upd-a1'
    # 1. nothing new
    check_btn(pg); wait_for(lambda: 'latest version (upd-a1)' in pg.inner_text('body'), 'says latest')
    # 2. a newer build on the server; the open app is still the old one
    build('upd-b2'); serve(); assert version_shown(pg) == 'upd-a1'
    check_btn(pg); wait_for(lambda: version_shown(pg) == 'upd-b2', 'Check for updates loads the new build')
    assert 'Version upd-b2' in pg.inner_text('body')
    pg.screenshot(path=f'test/t28-{name}-updated.png')
    # 3. newer again; the app is closed and reopened, served from the stored copy (the friend's case)
    build('upd-c3'); serve()
    pg.goto(URL); pg.wait_for_selector('text=New event')
    first = version_shown(pg); print(name, 'reopened showing', first)
    if first == 'upd-b2':   # served from the stored copy: the offer must come
        wait_for(lambda: pg.locator('.toast .tbtn', has_text='Update now').count() == 1, 'Update now offered on open')
        assert 'upd-c3' in pg.inner_text('.toast'); pg.screenshot(path=f'test/t28-{name}-offer.png')
        pg.locator('.toast .tbtn', has_text='Update now').click()
    wait_for(lambda: version_shown(pg) == 'upd-c3', 'Update now loads the new build')
    # and it stays new after another reopen
    pg.goto(URL); pg.wait_for_selector('text=New event'); time.sleep(3.5)
    assert version_shown(pg) == 'upd-c3' and pg.locator('.toast .tbtn', has_text='Update now').count() == 0, 'no offer when up to date'
    # 4. the app is left open in the background while a new build goes out, then comes back to the screen
    build('upd-d4'); serve(); assert version_shown(pg) == 'upd-c3'
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    wait_for(lambda: pg.locator('.toast .tbtn', has_text='Update now').count() == 1, 'Update now offered on return')
    assert 'upd-d4' in pg.inner_text('.toast'); pg.screenshot(path=f'test/t28-{name}-offer.png')
    pg.locator('.toast .tbtn', has_text='Update now').click()
    wait_for(lambda: version_shown(pg) == 'upd-d4', 'Update now loads the new build')
    # 5. offline: a clear message, nothing breaks
    ctx.set_offline(True); check_btn(pg); wait_for(lambda: 'needs a connection' in pg.inner_text('body'), 'offline message'); ctx.set_offline(False)
    ctx.close(); shutil.rmtree(prof, ignore_errors=True)
    assert not errs, errs
    print(name, 'ok')

try:
    with sync_playwright() as p:
        run(p, 'phone', {'width': 390, 'height': 844}, True)
        run(p, 'desktop', {'width': 1280, 'height': 900}, False)
    print('T28 OK')
finally:
    open(VJ, 'w').write(REAL); subprocess.run(['python3', 'build.py'], cwd=ROOT, capture_output=True)
    if server: server.terminate()
