import { describe, expect, it } from "vitest";
import { buildCsp, makeNonce } from "./csp";

describe("buildCsp", () => {
  const prod = buildCsp({ nonce: "abc123", supabaseUrl: "https://meuprojeto.supabase.co/rest/v1" });
  const dev = buildCsp({ nonce: "abc123", isDev: true });
  const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("scripts: só os da página com o nonce da requisição; sem 'unsafe-inline' nem 'unsafe-eval' em produção", () => {
    const scripts = directive(prod, "script-src");
    expect(scripts).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(scripts).not.toMatch(/unsafe/);
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'"); // só em desenvolvimento
  });

  it("ninguém embute o app, nada de plugins, base e formulários só do próprio site", () => {
    for (const rule of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) expect(prod).toContain(rule);
  });

  it("conexões: o próprio site e o Supabase configurado (só a origem, sem o caminho)", () => {
    expect(directive(prod, "connect-src")).toBe("connect-src 'self' https://meuprojeto.supabase.co");
    expect(directive(buildCsp({ nonce: "x" }), "connect-src")).toBe("connect-src 'self'");
    expect(directive(buildCsp({ nonce: "x", supabaseUrl: "lixo" }), "connect-src")).toBe("connect-src 'self'");
  });

  it("vídeos: só YouTube em modo de privacidade e Vimeo", () => {
    expect(directive(prod, "frame-src")).toBe("frame-src https://www.youtube-nocookie.com https://player.vimeo.com");
    expect(prod).not.toMatch(/https:\/\/www\.youtube\.com/);
  });

  it("produção força https; desenvolvimento (localhost, http) não", () => {
    expect(prod).toContain("upgrade-insecure-requests");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("um nonce novo e imprevisível a cada chamada", () => {
    const nonces = new Set(Array.from({ length: 50 }, makeNonce));
    expect(nonces.size).toBe(50);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
