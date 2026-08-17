#!/usr/bin/env python3
"""
يبني نسختين من الأداة:

  التمرين.html   ملف واحد مستقل — للاستخدام المحلي من غير سيرفر
  docs/          نسخة الويب (GitHub Pages) — PWA بتشتغل أوفلاين بعد أول فتح

مفيش أي بيانات شخصية في المخرجات: أرقام الوزن ونسبة الدهون والتغذية
بيكتبها المستخدم في «بياناتي» وبتتخزّن في localStorage على جهازه.
"""
import hashlib
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
PWA = os.path.join(SRC, 'pwa')
DOCS = os.path.join(HERE, 'docs')
STANDALONE = os.path.join(HERE, 'التمرين.html')

ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']

PWA_HEAD = """<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">"""

PWA_TAIL = """<script>
if ('serviceWorker' in navigator) {
  addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('sw', e); });
  });
}
</script>"""

MANIFEST = """{
  "name": "خطة التدريب — Push / Pull / Legs",
  "short_name": "التدريب",
  "lang": "ar",
  "dir": "rtl",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f2f5f9",
  "theme_color": "#1f3864",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
"""

SW = """/* كاش أوفلاين — النسخة بتتغيّر مع كل build فيتسحب التحديث لوحده */
const CACHE = 'ppl-%(ver)s';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* الكاش الأول عشان الجيم من غير نت — وبنحدّث في الخلفية لما يكون في شبكة */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
"""


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


FB_CONFIG = {
    '__FB_API_KEY__':     'AIzaSyB4tLyR7Rf5q7mDqwe-7USxLs6OlL8442U',
    '__FB_AUTH_DOMAIN__': 'ppl-trainer-ahmed.firebaseapp.com',
    '__FB_PROJECT_ID__':  'ppl-trainer-ahmed',
}

VENDOR = ['vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js']


def assemble(pwa):
    """pwa=True: نسخة الويب (فيها المزامنة). pwa=False: ملف مستقل من غير مزامنة."""
    html = read('shell.html')
    for token, fname in (('/*__CSS__*/', 'style.css'),
                         ('/*__IMG__*/', 'img-data.js'),
                         ('/*__PLAN__*/', 'plan.js'),
                         ('/*__APP__*/', 'app.js')):
        assert token in html, 'missing token ' + token
        html = html.replace(token, read(fname))

    if pwa:
        html = html.replace('/*__VENDOR__*/', '\n'.join(read(v) for v in VENDOR))
        sync = read('sync.js')
        for key, val in FB_CONFIG.items():
            assert key in sync, 'missing config token ' + key
            sync = sync.replace(key, val)
        html = html.replace('/*__SYNC__*/', sync)
        html = html.replace('<!--__PWA__-->', PWA_HEAD)
        html = html.replace('</body>', PWA_TAIL + '\n</body>')
    else:
        # الملف المستقل: من غير Firebase — بيشتغل محلي بالكامل
        html = html.replace('/*__VENDOR__*/', '').replace('/*__SYNC__*/', '')
        html = html.replace('<!--__PWA__-->', '')
    return html


def main():
    # ١ — الملف المستقل
    with open(STANDALONE, 'w', encoding='utf-8') as f:
        f.write(assemble(pwa=False))

    # ٢ — نسخة الويب
    os.makedirs(DOCS, exist_ok=True)
    web = assemble(pwa=True)
    ver = hashlib.sha1(web.encode('utf-8')).hexdigest()[:10]

    with open(os.path.join(DOCS, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(web)
    with open(os.path.join(DOCS, 'manifest.webmanifest'), 'w', encoding='utf-8') as f:
        f.write(MANIFEST)
    with open(os.path.join(DOCS, 'sw.js'), 'w', encoding='utf-8') as f:
        f.write(SW % {'ver': ver})
    for ic in ICONS:
        shutil.copyfile(os.path.join(PWA, ic), os.path.join(DOCS, ic))
    open(os.path.join(DOCS, '.nojekyll'), 'w').close()

    mb = os.path.getsize(STANDALONE) / 1048576
    print('التمرين.html   %.2f ميجا' % mb)
    print('docs/          index.html + sw.js + manifest + %d أيقونات  (نسخة %s)' % (len(ICONS), ver))


if __name__ == '__main__':
    main()
