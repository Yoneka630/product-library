/* Product Library Service Worker
 * - Caches the app shell so the installed PWA can launch offline.
 * - CACHE_VERSION is bumped by deploy.mjs on every release so a fresh build
 *   atomically replaces the old cache (clients get the new app on next load).
 * - Sync (S3) is intentionally NOT cached: the app talks to S3 directly so
 *   data is always live; only static app assets are cached here.
 */
const CACHE_VERSION = 'v2026.10.06';                 // ← deploy.mjs 会自动 bump
const APP_SHELL = [
  './',
  './product-library.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL).catch(() => {/* 缺失资源降级，不阻塞安装 */});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 删除所有旧版本缓存（缓存破坏：部署新版时自动清理）
    const names = await caches.keys();
    await Promise.all(names.map((n) => n !== CACHE_VERSION ? caches.delete(n) : null));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) S3 同步流量：放行，永远走网络（不缓存远程快照/图片）
  if (url.host !== self.location.host) return;

  // 2) GET 静态资源：cache-first + 后台 stale-while-revalidate
  if (req.method === 'GET') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((resp) => {
        if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
  }
  // 其他方法（POST/PUT 等）放行
});