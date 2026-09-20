/*
 * Service worker do PWA (instalável, com página de "sem internet").
 *
 * Decisão de privacidade: este service worker NUNCA guarda páginas do aplicativo nem respostas com dados
 * de pessoas. Só guarda (1) arquivos estáticos que não mudam (/_next/static, com nome que muda a cada versão)
 * e (2) a página /offline. Motivos: celular compartilhado não pode mostrar a lição ou o progresso de outra
 * pessoa, e uma página em cache poderia mostrar progresso desatualizado. Uso offline das lições fica para
 * quando houver um desenho de privacidade e de sincronização (docs/DECISIONS.md).
 */
const VERSION = "v1";
const STATIC_CACHE = `vd-static-${VERSION}`;
const OFFLINE_CACHE = `vd-offline-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Só apaga o que é nosso e de versões antigas.
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("vd-") && k !== STATIC_CACHE && k !== OFFLINE_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cacheFirst(request) {
  return caches.open(STATIC_CACHE).then((cache) =>
    cache.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }),
    ),
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // ações (POST) sempre vão direto à rede

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Google, leitor bíblico etc.: não é com a gente

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    // Rede primeiro, sempre. A resposta NÃO é guardada; só se a rede falhar mostramos a página de "sem internet".
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
  // Tudo o mais (dados, exportação, login) passa direto, sem cache.
});
