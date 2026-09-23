/* Çevrimdışı açılış (service worker).
   - Sayfa (index.html): önce ağ; internet yoksa kaydedilmiş kopya. Böylece internet varken güncellemeler hemen gelir.
   - Sürümlü dosyalar (?v=...) ve sabit sürümlü supabase-js: önce önbellek (değişmezler).
   - Supabase API istekleri (giriş, eşitleme) HİÇ önbelleğe alınmaz; çevrimdışı değişiklikler zaten localStorage'da
     durur ve sync.js internet gelince ('online' olayı) eşitler.
   Sürüm, kayıt adresindeki ?v= etiketinden gelir (app.js kaydeder); yeni sürümde eski önbellek silinir. */
const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = `odak-${VERSION}`;
const APP_FILES = ['./', ...['styles.css', 'curriculum.js', 'app.js', 'program-editor.js', 'cards.js', 'flashcards.js', 'sync.js', 'config.js'].map(file => `${file}?v=${VERSION}`)];
// supabase-js@2.117.0 ve içe aktardığı modüller (sync.js'teki sabit sürümle aynı olmalı).
const CDN_FILES = [
  '@supabase/supabase-js@2.117.0', '@supabase/functions-js@2.117.0', 'tslib@2.8.1', '@supabase/postgrest-js@2.117.0',
  '@supabase/realtime-js@2.117.0', '@supabase/phoenix@0.4.5', '@supabase/storage-js@2.117.0', 'iceberg-js@0.8.1',
  '@supabase/auth-js@2.117.0',
].map(pkg => `https://cdn.jsdelivr.net/npm/${pkg}/+esm`);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...APP_FILES, ...CDN_FILES])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('odak-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('zaman aşımı')), ms))]);

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname.endsWith('supabase.co')) return; // API: her zaman ağ

  if (request.mode === 'navigate') {
    // Önce ağ (güncel sürüm); 5 sn'de yanıt yoksa ya da internet yoksa kayıtlı sayfa.
    event.respondWith(withTimeout(fetch(request), 5000)
      .then(response => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('./', copy)); }
        return response;
      })
      .catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }

  const cacheable = url.origin === self.location.origin || url.hostname === 'cdn.jsdelivr.net'
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;
  // Önce önbellek; yoksa ağdan al ve sakla (fontlar ilk açılışta, dosyalar sürüm değişince yenilenir).
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok || response.type === 'opaque') { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
