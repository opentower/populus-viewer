import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST)

// extra precaching
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("static").then(cache => {
      cache.add("https://rsms.me/inter/font-files/Inter-roman.var.woff2?v=3.18");
      cache.add("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&display=swap");
      cache.add("https://cdn.jsdelivr.net/npm/katex@0.13.2/dist/katex.min.css");
    })
  );
});

registerRoute(
  // dynamically cache thumbnails
  ({ request }) => request.url.includes('_matrix/media/r0/thumbnail/') && request.destination === 'image',
  new CacheFirst({
    // Put all cached files in a cache named 'images'
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30 // 30 Days
      })
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    // Look for other images in cache, but don't add any that aren't from precache
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [] })
    ]
  })
);

// network-first caching of aliases, roomHierarchy, and server data
registerRoute(
  ({ request }) =>
    request.url.includes('_matrix/client/r0/directory/room/') ||
    request.url.includes('_matrix/client/versions') ||
    request.url.includes('_matrix/client/unstable/org.matrix.msc2946/rooms/')
  ,
  new NetworkFirst({
    cacheName: 'aliases',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] })
    ]
  })
);

registerRoute(
  ({ request }) => request.url.includes('_matrix/media/r0/download/'),
  new CacheFirst({
    cacheName: 'media',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [200],
        headers: { "content-type": "application/pdf" }
      }),
      new ExpirationPlugin({ maxEntries: 10 })
    ]
  })
);

registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'worker',
  new StaleWhileRevalidate({
    cacheName: 'assets',
    plugins: [
      // Ensure that only requests that result in a 200 status are cached
      new CacheableResponsePlugin({ statuses: [200] })
    ]
  })
);
