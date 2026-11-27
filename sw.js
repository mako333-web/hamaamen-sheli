/* Service worker של "המאמן שלי".
   עדכונים מגיעים תמיד: הדף עצמו (index.html) נטען קודם מהרשת, והעותק השמור משמש רק כשאין אינטרנט.
   ספריות עם מספר גרסה בכתובת (three.js, Firebase) נשמרות ונטענות מהמטמון, כי הן לא משתנות.
   בקשות של כניסה ושל מסד הנתונים (Firebase Auth / Firestore) לא עוברות דרך כאן בכלל. */
const V = 'v1';
const PAGES = 'pages-' + V, ASSETS = 'assets-' + V;
const CORE = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGES).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== PAGES && k !== ASSETS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ספריות קבועות לפי גרסה: מטמון קודם
const IMMUTABLE = [
  /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/[^/]+@\d/,
  /^https:\/\/www\.gstatic\.com\/firebasejs\/\d/,
  /^https:\/\/fonts\.gstatic\.com\//
];
// משתנים לפעמים: מהמטמון מיד, ומתעדכן ברקע
const SWR = [/^https:\/\/fonts\.googleapis\.com\/css/];

async function networkFirst(req) {
  const c = await caches.open(PAGES);
  try {
    const r = await fetch(req, { cache: 'no-cache' });
    if (r && r.ok) c.put(req.mode === 'navigate' ? './' : req, r.clone());
    return r;
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match('./')) || Response.error();
  }
}
async function cacheFirst(req) {
  const c = await caches.open(ASSETS);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
  return r;
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(ASSETS);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.includes('/__/')) return; // דפי הכניסה של Firebase
  if (req.mode === 'navigate' && same) return e.respondWith(networkFirst(req));
  if (same) {
    if (url.pathname.endsWith('/sw.js')) return;
    // המודל התלת-ממדי והאייקונים: מהיר מהמטמון, מתעדכן ברקע
    if (/\/(models|icons)\//.test(url.pathname)) return e.respondWith(staleWhileRevalidate(req));
    return e.respondWith(networkFirst(req));
  }
  if (IMMUTABLE.some(r => r.test(req.url))) return e.respondWith(cacheFirst(req));
  if (SWR.some(r => r.test(req.url))) return e.respondWith(staleWhileRevalidate(req));
  // כל השאר (Firebase Auth, Firestore, Google) הולך ישר לרשת
});
