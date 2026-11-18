#!/usr/bin/env python3
"""Build the tryout app into one file: dist/app.json plus dist/build.txt.

Pattern copied from ShotPulse, kept simple:
  1. join the JS files in a fixed order
  2. replace placeholders (__NAME__, __BUILD__, __LABEL__, __CACHE__)
  3. put CSS and JS into the HTML shell
  4. add the service worker, manifest and icons
  5. write {build, label, html, sw, manifest, icon_svg, i192, i512, apple, files}
Every version needs a new build name in version.json; the service-worker cache name is made from it.
"""
import base64, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
JS_ORDER = ['dom.js', 'ui.js', 'sports.js', 'store.js', 'views.js', 'score.js', 'main.js']
CSS_ORDER = ['fonts.css', 'style.css', 'app.css']


def read(*p):
    with open(os.path.join(SRC, *p), encoding='utf-8') as f:
        return f.read()


def b64(*p):
    with open(os.path.join(SRC, *p), 'rb') as f:
        return base64.b64encode(f.read()).decode()


def main():
    with open(os.path.join(ROOT, 'version.json'), encoding='utf-8') as f:
        v = json.load(f)
    build, name, label = v['build'], v['name'], v['label']
    if not re.fullmatch(r'[A-Za-z0-9._-]{3,40}', build):
        sys.exit('bad build name: ' + build)
    cache = 'tr-' + build
    subs = {'__NAME__': name, '__BUILD__': build, '__LABEL__': label, '__CACHE__': cache}

    def fill(text):
        return re.sub(r'__(NAME|BUILD|LABEL|CACHE)__', lambda m: subs[m.group(0)], text)

    js = '\n'.join('/* ---- %s ---- */\n%s' % (n, read('js', n)) for n in JS_ORDER)
    css = '\n'.join(read('css', n) for n in CSS_ORDER)
    shell = fill(read('shell.html'))
    html = shell.replace('__CSS__', css, 1).replace('__JS__', fill(js), 1)
    sw = fill(read('sw.js'))
    manifest = json.dumps({
        'id': '/', 'name': name, 'short_name': name,
        'description': 'Tryouts and camps: score players by jersey number from any phone.',
        'start_url': '/', 'scope': '/', 'display': 'standalone', 'orientation': 'any', 'lang': 'en',
        'background_color': '#0b0b0e', 'theme_color': '#0b0b0e', 'categories': ['sports'],
        'icons': [
            {'src': '/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': '/icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
            {'src': '/icon.svg', 'sizes': 'any', 'type': 'image/svg+xml'}]}, separators=(',', ':'))

    # checks: no placeholder left, version inside the app matches the file, cache name matches
    for label_, text in (('html', html), ('sw', sw)):
        left = re.findall(r'__[A-Z]+__', text)
        if left:
            sys.exit('placeholder left in %s: %s' % (label_, left[:5]))
    if ("build: '%s'" % build) not in html or ("const V = '%s'" % cache) not in sw:
        sys.exit('version check failed')

    bundle = {
        'build': build, 'label': label, 'app': 'tryout', 'html': html, 'sw': sw, 'manifest': manifest,
        'icon_svg': read('img', 'icon.svg'), 'i192': b64('img', 'icon-192.png'), 'i512': b64('img', 'icon-512.png'),
        'apple': b64('img', 'apple-touch-icon.png'),
        'files': {'/icon-maskable-512.png': {'type': 'image/png', 'b64': b64('img', 'icon-maskable-512.png')}}}
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    with open(os.path.join(ROOT, 'dist', 'app.json'), 'w', encoding='utf-8') as f:
        json.dump(bundle, f, separators=(',', ':'))
    with open(os.path.join(ROOT, 'dist', 'build.txt'), 'w', encoding='utf-8') as f:
        f.write(build + '\n')
    with open(os.path.join(ROOT, 'dist', 'app-check.js'), 'w', encoding='utf-8') as f:
        f.write(fill(js))   # the joined JS on its own, for the syntax check
    print('built', build, 'html', len(html), 'bytes; app.json', os.path.getsize(os.path.join(ROOT, 'dist', 'app.json')), 'bytes')


if __name__ == '__main__':
    main()
