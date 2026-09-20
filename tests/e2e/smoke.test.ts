import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// O app pede o cliente do Supabase à sessão de teste, e não sai para a rede.
vi.mock("@/lib/supabase/server", async () => {
  const { session } = await import("./session");
  return { createClient: async () => session.client };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

import HomePage from "@/app/(member)/page";
import { loadTrail } from "@/lib/trail/queries";
import { CLAUDIAO, CLAUDINHO, visit, World } from "./world";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test";

let world: World;
beforeAll(async () => {
  world = await World.create();
  await world.importContent({ publish: true, cycles: [1] });
});
afterAll(async () => {
  await world.close();
});

describe("adaptador do Supabase em memória", () => {
  it("o app carrega a trilha por ele, com RLS: o membro vê só as lições publicadas", async () => {
    const id = await world.login(CLAUDINHO);
    const { createClient } = await import("@/lib/supabase/server");
    const trail = await loadTrail(await createClient(), id);
    expect(trail.cycles).toHaveLength(1);
    expect(trail.cycles[0].lessons).toHaveLength(8);
    expect(trail.next?.slug).toBe("c1-l01");
  });

  it("uma página é renderizada de verdade e mostra o que a pessoa veria", async () => {
    await world.login(CLAUDIAO);
    const first = await visit(HomePage);
    // Claudião ainda não concluiu o primeiro acesso.
    expect(first.redirect).toBe("/onboarding");
  });

  it("visitante sem login é mandado ao login", async () => {
    world.visitor();
    expect((await visit(HomePage)).redirect).toBe("/login");
  });
});
