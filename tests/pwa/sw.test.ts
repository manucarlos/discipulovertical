import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * Executa public/sw.js de verdade, num ambiente simulado (Cache Storage, fetch e eventos), e confere o que
 * ele faz. O que mais importa aqui é o que ele NÃO faz: guardar páginas com dados da pessoa.
 */
const code = fs.readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://app.test";

class FakeCache {
  store = new Map<string, Response>();
  private key = (r: Request | string) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);
  async match(r: Request | string) {
    return this.store.get(this.key(r))?.clone();
  }
  async put(r: Request | string, res: Response) {
    this.store.set(this.key(r), res);
  }
  async addAll(urls: string[]) {
    for (const u of urls) this.store.set(this.key(u), new Response(`cached:${u}`));
  }
}
class FakeCaches {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(r: Request | string) {
    for (const c of this.caches.values()) {
      const hit = await c.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
}

function boot(fetchImpl: (r: Request) => Promise<Response> = async () => new Response("rede")) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const caches = new FakeCaches();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  const network = vi.fn(fetchImpl);
  vm.runInNewContext(code, { self, caches, fetch: network, URL, Promise, Response });

  const lifecycle = async (type: "install" | "activate") => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };
  /** Dispara um fetch; devolve a resposta (ou undefined se o service worker não interceptou). */
  const request = async (url: string, init: { method?: string; mode?: string } = {}) => {
    const req = { url: new URL(url, ORIGIN).href, method: init.method ?? "GET", mode: init.mode ?? "cors", clone: () => req } as unknown as Request;
    let handled: Promise<Response> | undefined;
    listeners.fetch({ request: req, respondWith: (p: Promise<Response>) => (handled = p) });
    return handled === undefined ? undefined : await handled;
  };
  return { self, caches, network, lifecycle, request };
}

describe("instalação e limpeza", () => {
  it("guarda só a página de 'sem internet' e o ícone, e assume o controle na hora", async () => {
    const sw = boot();
    await sw.lifecycle("install");
    const stored = [...(await sw.caches.open("vd-offline-v1")).store.keys()];
    expect(stored.sort()).toEqual([`${ORIGIN}/icons/icon-192.png`, `${ORIGIN}/offline`]);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("ao ativar, apaga só os caches antigos deste app e não mexe nos de terceiros", async () => {
    const sw = boot();
    for (const name of ["vd-static-v0", "vd-offline-v0", "vd-static-v1", "outro-app-cache"]) await sw.caches.open(name);
    await sw.lifecycle("activate");
    expect((await sw.caches.keys()).sort()).toEqual(["outro-app-cache", "vd-static-v1"]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});

describe("navegação", () => {
  it("online: mostra a página da rede e NÃO a guarda", async () => {
    const sw = boot(async () => new Response("<html>lição da Maria</html>"));
    await sw.lifecycle("install");
    const res = await sw.request("/licao/c1-l01", { mode: "navigate" });
    expect(await res!.text()).toContain("lição da Maria");
    // Nenhum cache passou a conter a página: outra pessoa no mesmo aparelho não a veria.
    for (const cache of sw.caches.caches.values()) {
      expect([...cache.store.keys()].some((k) => k.includes("/licao/"))).toBe(false);
    }
  });

  it("offline: mostra a página de 'sem internet'", async () => {
    const sw = boot(async () => {
      throw new TypeError("Failed to fetch");
    });
    await sw.lifecycle("install");
    const res = await sw.request("/", { mode: "navigate" });
    expect(await res!.text()).toBe("cached:/offline");
  });
});

describe("arquivos estáticos", () => {
  it("o primeiro acesso vai à rede e guarda; o segundo vem do cache, sem rede", async () => {
    const sw = boot(async () => new Response("js do app"));
    await sw.lifecycle("install");
    const first = await sw.request("/_next/static/chunks/app-abc123.js");
    expect(await first!.text()).toBe("js do app");
    expect(sw.network).toHaveBeenCalledTimes(1);

    const second = await sw.request("/_next/static/chunks/app-abc123.js");
    expect(await second!.text()).toBe("js do app");
    expect(sw.network).toHaveBeenCalledTimes(1); // não foi à rede de novo
  });

  it("não guarda resposta de erro", async () => {
    const sw = boot(async () => new Response("erro", { status: 500 }));
    await sw.request("/_next/static/chunks/quebrado.js");
    await sw.request("/_next/static/chunks/quebrado.js");
    expect(sw.network).toHaveBeenCalledTimes(2);
  });
});

describe("o que passa direto, sem service worker", () => {
  it("ações (POST), outros sites e dados nunca são interceptados", async () => {
    const sw = boot();
    await sw.lifecycle("install");
    expect(await sw.request("/perfil/exportar", { method: "POST" })).toBeUndefined();
    expect(await sw.request("https://accounts.google.com/o/oauth2/auth")).toBeUndefined();
    expect(await sw.request("https://www.biblegateway.com/passage/?search=Jo%C3%A3o%203.16")).toBeUndefined();
    // GET que não é navegação nem arquivo estático (exportação de dados, chamadas de dados): direto à rede.
    expect(await sw.request("/perfil/exportar")).toBeUndefined();
    expect(await sw.request("/auth/callback?code=x")).toBeUndefined();
  });
});
