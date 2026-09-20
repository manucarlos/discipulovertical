"use client";

import { useEffect } from "react";

/** Registra o service worker (página de "sem internet" e arquivos estáticos). Só em produção. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o app funciona igual; só não abre a página de "sem internet".
    });
  }, []);
  return null;
}
