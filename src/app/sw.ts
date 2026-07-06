import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";

// This declares the value of `injectionPoint` to Serwist's typings. Change if
// you decided to change the value yourself.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Cache-first for map tile hosts: tiles are effectively immutable per z/x/y
// and are the backbone of offline field usage, so keep them around for a
// while and cap how many we hoard.
const mapTileCache: RuntimeCaching = {
  matcher: ({ url }) =>
    url.hostname === "server.arcgisonline.com" ||
    url.hostname === "tiles.openfreemap.org",
  handler: new CacheFirst({
    cacheName: "map-tiles",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
};

// Authed HTML/RSC/API responses must NOT be runtime-cached: those caches key
// only on URL, so on a shared device user B could be served user A's cached
// org pages after logout. Keep only static-asset caches from Serwist's
// defaults; offline data lives in Dexie, not in cached RSC payloads.
// Names as shipped in @serwist/next 9.5 (see dist/index.worker.mjs): "others"
// is the same-origin catch-all that would cache HTML/RSC documents.
const UNSAFE_CACHE_NAMES = new Set(["apis", "next-data", "others"]);

const staticAssetCache = defaultCache.filter((entry) => {
  const cacheName =
    typeof entry.handler === "object" && "cacheName" in entry.handler
      ? (entry.handler as { cacheName?: string }).cacheName
      : undefined;
  return cacheName === undefined || !UNSAFE_CACHE_NAMES.has(cacheName);
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [mapTileCache, ...staticAssetCache],
});

serwist.addEventListeners();
