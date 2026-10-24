/* Tipping League service worker.
 *
 * Strategy:
 *   - navigation: network first, fall back to the cached shell (offline)
 *   - same-origin assets: cache first (Vite filenames are content-hashed)
 *   - anything cross-origin (Supabase, Svenska Spel) is never touched
 *
 * Bump VERSION on a deploy that changes the shell behaviour.
 */
const VERSION = 'v1'
const CACHE = `tipping-${VERSION}`
const BASE = new URL('./', self.location.href).pathname
const SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}favicon.svg`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/maskable-512.png`,
  `${BASE}apple-touch-icon.png`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith('tipping-') && key !== CACHE).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(BASE)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          if (fresh.ok) {
            const cache = await caches.open(CACHE)
            cache.put(`${BASE}index.html`, fresh.clone())
          }
          return fresh
        } catch {
          return (await caches.match(`${BASE}index.html`)) ?? Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok && /\.(?:js|css|woff2|png|svg|webmanifest)$/.test(url.pathname)) {
        const cache = await caches.open(CACHE)
        cache.put(request, response.clone())
      }
      return response
    })(),
  )
})
