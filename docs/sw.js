/* كاش أوفلاين — النسخة بتتغيّر مع كل build فيتسحب التحديث لوحده */
const CACHE = 'ppl-b2d4de60e8';
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
