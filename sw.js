const CACHE = "mis-pagos-v1";

// Only cache local files — no external CDN dependencies
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  // Only handle same-origin requests
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});

// ── IndexedDB ─────────────────────────────────────────────────
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("mispagos-db", 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore("kv");
    r.onsuccess = e => res(e.target.result);
    r.onerror   = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

// ── Periodic background sync ──────────────────────────────────
self.addEventListener("periodicsync", e => {
  if (e.tag === "check-payments") e.waitUntil(checkPayments());
});

async function checkPayments() {
  let data;
  try { data = await idbGet("upcoming"); } catch(e) { return; }
  if (!data || !data.items || !data.items.length) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (const item of data.items) {
    const limit = new Date(item.limitDate);
    const days  = Math.ceil((limit - today) / 86400000);
    if (days > 5) continue;

    const title = days < 0  ? "⚠ Pago vencido"
                : days === 0 ? "⚠ Vence HOY"
                :              "Recordatorio de pago";
    const body  = days < 0  ? `${item.cardName}: el límite ya pasó`
                : days === 0 ? `${item.cardName}: último día para pagar`
                :              `${item.cardName}: vence en ${days} día${days !== 1 ? "s" : ""}`;

    await self.registration.showNotification(title, {
      body, tag: `mp-${item.key}`,
      icon: "./icon-192.png", vibrate: [200, 100, 200],
      data: { url: "./" }
    });
  }
}

// ── Notification click ─────────────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data?.url || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes("Control-de-pagos") && "focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
