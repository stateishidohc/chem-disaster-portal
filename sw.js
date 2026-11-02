/* 化学災害 産業保健ポータル — Service Worker
   - アプリ本体はネットワーク優先（更新をすぐ反映）、圏外ではキャッシュで動く
   - 地図ライブラリ（CDN）はキャッシュ優先。地図タイル・PubChem はキャッシュしない
   更新時は CACHE 名を上げる */
const CACHE = "cdportal-v1.0.2";
const ASSETS = [
  "./", "./index.html", "./manifest.json", "./css/style.css",
  "./data/sources.js", "./data/chemicals.js", "./data/glossary.js", "./data/lessons.js", "./data/case.js",
  "./js/model.js", "./js/dense.js", "./js/dispersion.js", "./js/live.js", "./js/sim-ui.js", "./js/app.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];
const CDN = ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css", "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(ASSETS);
    await Promise.all(CDN.map(u => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname.includes("cyberjapandata") || url.hostname.includes("pubchem")) return;
  if (CDN.includes(e.request.url)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});
