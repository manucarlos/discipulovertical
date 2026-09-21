import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb, createUser } from "./harness";

let db: PGlite;
let admin: string;
let editor: string;
let member1: string;
let member2: string;
let cycleId: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);

/** Cria uma lição com uma versão de conteúdo, como dono do banco (fixture; não passa pela RLS). */
async function createLesson(slug: string, position: number, hasPlaceholders = false) {
  const rows = await q<{ id: string }>(
    `insert into public.lessons (cycle_id, slug, title, position, has_placeholders)
     values ($1, $2, $3, $4, $5) returning id`,
    [cycleId, slug, `Lição ${slug}`, position, hasPlaceholders],
  );
  const id = rows[0].id;
  const [version] = await q<{ id: string }>(
    `insert into public.lesson_versions (lesson_id, content) values ($1, '{"blocks": []}') returning id`,
    [id],
  );
  await q("update public.lessons set current_version_id = $1 where id = $2", [version.id, id]);
  return id;
}

beforeAll(async () => {
  db = await createDb();
  await q("insert into public.app_config (key, value) values ('initial_admin_email', 'Pastor@Example.com')");
  admin = await createUser(db, "pastor@example.com", { name: "Pastor" });
  editor = await createUser(db, "editor@example.com");
  member1 = await createUser(db, "membro1@example.com");
  member2 = await createUser(db, "membro2@example.com");
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));
  cycleId = (
    await q<{ id: string }>(
      "insert into public.cycles (slug, title, position) values ('c1', 'Fundamentos', 1) returning id",
    )
  )[0].id;
});

afterAll(async () => {
  await db.close();
});

describe("perfis e papéis", () => {
  it("cria o perfil no primeiro login; o e-mail inicial vira Admin, sem diferenciar maiúsculas", async () => {
    const rows = await q<{ id: string; role: string }>("select id, role from public.profiles");
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.role]));
    expect(byId[admin]).toBe("admin");
    expect(byId[member1]).toBe("member");
  });

  it("e-mail não confirmado nunca vira Admin", async () => {
    const id = await createUser(db, "PASTOR@example.com", { confirmed: false });
    const [row] = await q<{ role: string }>("select role from public.profiles where id = $1", [id]);
    expect(row.role).toBe("member");
  });

  // Estes testes criam contas com o e-mail do primeiro Admin; cada um apaga o que criou
  // para não sobrar Admin extra nos testes seguintes.
  const roleOf = async (id: string) =>
    (await q<{ role: string }>("select role from public.profiles where id = $1", [id]))[0].role;
  const cleanup = (id: string) => q("delete from auth.users where id = $1", [id]);

  it("como no Supabase de verdade (criado sem confirmar, confirmado depois), o e-mail inicial vira Admin, com registro", async () => {
    const id = await createUser(db, "Pastor@example.com", { confirmed: false });
    try {
      expect(await roleOf(id)).toBe("member");

      await q("update auth.users set email_confirmed_at = now() where id = $1", [id]);
      expect(await roleOf(id)).toBe("admin");
      expect(
        await q("select 1 from public.audit_log where action = 'initial_admin_assigned' and entity_id = $1", [id]),
      ).toHaveLength(1);
    } finally {
      await cleanup(id);
    }
  });

  it("confirmar o e-mail de outra pessoa depois da criação não promove ninguém", async () => {
    const id = await createUser(db, "intruso@example.com", { confirmed: false });
    try {
      await q("update auth.users set email_confirmed_at = now() where id = $1", [id]);
      expect(await roleOf(id)).toBe("member");
    } finally {
      await cleanup(id);
    }
  });

  it("e-mail já confirmado no INSERT também vira Admin (SQL Editor, outros provedores)", async () => {
    const id = await createUser(db, "PASTOR@example.com", { confirmedOnInsert: true });
    try {
      expect(await roleOf(id)).toBe("admin");
    } finally {
      await cleanup(id);
    }
  });

  it("uma segunda atualização da confirmação não promove de novo quem foi rebaixado", async () => {
    const id = await createUser(db, "pastor@example.com");
    try {
      expect(await roleOf(id)).toBe("admin");
      await q("update public.profiles set role = 'member' where id = $1", [id]);
      await q("update auth.users set email_confirmed_at = now() where id = $1", [id]);
      expect(await roleOf(id)).toBe("member");
    } finally {
      await cleanup(id);
    }
  });

  it("membro vê só o próprio perfil; Admin vê todos", async () => {
    const own = await asUser(db, member1, () => q("select id from public.profiles"));
    expect(own).toHaveLength(1);
    const all = await asUser(db, admin, () => q("select id from public.profiles"));
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it("membro edita o próprio nome, mas não o papel", async () => {
    const ok = await asUser(db, member1, () =>
      q("update public.profiles set display_name = 'Maria' where id = $1 returning id", [member1]),
    );
    expect(ok).toHaveLength(1);

    await expect(
      asUser(db, member1, () => q("update public.profiles set role = 'admin' where id = $1", [member1])),
    ).rejects.toThrow(/permission denied/);
  });

  it("membro não altera o perfil de outra pessoa", async () => {
    const rows = await asUser(db, member1, () =>
      q("update public.profiles set display_name = 'Hack' where id = $1 returning id", [member2]),
    );
    expect(rows).toHaveLength(0);
  });

  it("só Admin promove perfis, e a promoção é auditada", async () => {
    await expect(
      asUser(db, member1, () => q("select public.admin_set_role($1, 'admin')", [member1])),
    ).rejects.toThrow(/não autorizado/);
    await expect(
      asUser(db, editor, () => q("select public.admin_set_role($1, 'admin')", [editor])),
    ).rejects.toThrow(/não autorizado/);

    const log = await asUser(db, admin, () =>
      q("select action, details from public.audit_log where action = 'role_changed' and entity_id = $1", [editor]),
    );
    expect(log).toHaveLength(1);
    expect(log[0].details).toMatchObject({ from: "member", to: "editor" });
  });

  it("não permite remover o último Admin", async () => {
    await expect(
      asUser(db, admin, () => q("select public.admin_set_role($1, 'member')", [admin])),
    ).rejects.toThrow(/último administrador/);
  });
});

describe("log de auditoria", () => {
  it("Admin lê; membro não vê nada", async () => {
    expect((await asUser(db, admin, () => q("select 1 from public.audit_log"))).length).toBeGreaterThan(0);
    expect(await asUser(db, member1, () => q("select 1 from public.audit_log"))).toHaveLength(0);
  });

  it("é somente inserção, até para Admin e para o dono do banco", async () => {
    await expect(
      asUser(db, admin, () => q("update public.audit_log set action = 'x'")),
    ).rejects.toThrow(/permission denied/);
    await expect(q("update public.audit_log set action = 'x'")).rejects.toThrow(/somente inserção/);
    await expect(q("delete from public.audit_log")).rejects.toThrow(/somente inserção/);
  });
});

describe("consentimentos (LGPD)", () => {
  it("membro registra o próprio aceite, com data automática", async () => {
    const rows = await asUser(db, member1, () =>
      q(
        `insert into public.consents (user_id, purpose, term_version)
         values ($1, 'data_processing', 'v1') returning accepted_at`,
        [member1],
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it("não registra aceite em nome de outra pessoa nem retroage a data", async () => {
    await expect(
      asUser(db, member1, () =>
        q("insert into public.consents (user_id, purpose, term_version) values ($1, 'data_processing', 'v1')", [member2]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, member1, () =>
        q("insert into public.consents (user_id, purpose, term_version, accepted_at) values ($1, 'email_reminders', 'v1', '2020-01-01')", [member1]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, member1, () => q("update public.consents set accepted_at = '2020-01-01'")),
    ).rejects.toThrow(/permission denied/);
  });

  it("aceite duplicado é barrado; depois de revogar, pode aceitar de novo", async () => {
    await expect(
      asUser(db, member1, () =>
        q("insert into public.consents (user_id, purpose, term_version) values ($1, 'data_processing', 'v1')", [member1]),
      ),
    ).rejects.toThrow(/duplicate key/);

    await asUser(db, member1, () =>
      q("update public.consents set revoked_at = now() where user_id = $1 and purpose = 'data_processing'", [member1]),
    );
    const again = await asUser(db, member1, () =>
      q("insert into public.consents (user_id, purpose, term_version) values ($1, 'data_processing', 'v1') returning id", [member1]),
    );
    expect(again).toHaveLength(1);
  });

  it("membro não vê consentimentos de outros", async () => {
    const rows = await asUser(db, member2, () => q("select 1 from public.consents"));
    expect(rows).toHaveLength(0);
  });
});

describe("conteúdo", () => {
  let lessonId: string;
  let versionId: string;

  it("editor cria rascunho e versão, mas não publica", async () => {
    const created = await asUser(db, editor, () =>
      q<{ id: string }>(
        `insert into public.lessons (cycle_id, slug, title, position, status)
         values ($1, 'c1-l01', 'Bem-vindo', 1, 'draft') returning id`,
        [cycleId],
      ),
    );
    lessonId = created[0].id;

    const v = await asUser(db, editor, () =>
      q<{ id: string }>(
        `insert into public.lesson_versions (lesson_id, content, author_id)
         values ($1, '{"blocks": []}', $2) returning id`,
        [lessonId, editor],
      ),
    );
    versionId = v[0].id;
    await asUser(db, editor, () =>
      q("update public.lessons set current_version_id = $1 where id = $2", [versionId, lessonId]),
    );

    await expect(
      asUser(db, editor, () => q("update public.lessons set status = 'published' where id = $1", [lessonId])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, editor, () =>
        q("insert into public.lessons (cycle_id, slug, title, position, status) values ($1, 'x', 'x', 99, 'published')", [cycleId]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("membro não vê rascunho", async () => {
    expect(await asUser(db, member1, () => q("select 1 from public.lessons"))).toHaveLength(0);
    expect(await asUser(db, member1, () => q("select 1 from public.lesson_versions"))).toHaveLength(0);
  });

  it("lição com [PREENCHER] não publica, nem pelo Admin", async () => {
    const id = await createLesson("c3-l01", 90, true);
    await expect(
      asUser(db, admin, () => q("update public.lessons set status = 'published' where id = $1", [id])),
    ).rejects.toThrow(/lessons_no_publish_with_placeholders/);
  });

  it("Admin publica; a publicação é auditada e o membro passa a ver só a versão vigente", async () => {
    await asUser(db, admin, () =>
      q("update public.lessons set status = 'published' where id = $1", [lessonId]),
    );
    const audit = await asUser(db, admin, () =>
      q("select actor_id from public.audit_log where action = 'lesson_published' and entity_id = $1", [lessonId]),
    );
    expect(audit).toHaveLength(1);

    expect(await asUser(db, member1, () => q("select 1 from public.lessons where id = $1", [lessonId]))).toHaveLength(1);
    expect(
      await asUser(db, member1, () => q("select 1 from public.lesson_versions where id = $1", [versionId])),
    ).toHaveLength(1);

    // Uma versão nova, ainda não vigente, continua invisível ao membro.
    const v2 = await asUser(db, editor, () =>
      q<{ id: string }>(
        "insert into public.lesson_versions (lesson_id, content, author_id) values ($1, '{}', $2) returning id",
        [lessonId, editor],
      ),
    );
    expect(
      await asUser(db, member1, () => q("select 1 from public.lesson_versions where id = $1", [v2[0].id])),
    ).toHaveLength(0);
  });

  it("histórico de versões é imutável", async () => {
    await expect(
      asUser(db, admin, () => q("update public.lesson_versions set content = '{}'")),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db, admin, () => q("delete from public.lesson_versions"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("campos internos e quiz nunca chegam ao membro", async () => {
    await asUser(db, editor, () =>
      q("insert into public.lesson_internal_notes (lesson_id, pastoral_review_note) values ($1, 'confirmar horários')", [lessonId]),
    );
    await asUser(db, editor, () =>
      q(
        `insert into public.quiz_questions (lesson_id, position, prompt, options, correct_option)
         values ($1, 1, 'Pergunta?', '{"A":"a","B":"b","C":"c"}', 'B')`,
        [lessonId],
      ),
    );
    expect(await asUser(db, member1, () => q("select 1 from public.lesson_internal_notes"))).toHaveLength(0);
    expect(await asUser(db, member1, () => q("select 1 from public.quiz_questions"))).toHaveLength(0);
    expect(await asUser(db, editor, () => q("select 1 from public.lesson_internal_notes"))).toHaveLength(1);
  });

  it("membro não escreve em conteúdo", async () => {
    await expect(
      asUser(db, member1, () => q("insert into public.cycles (slug, title, position) values ('z', 'z', 9)")),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, member1, () =>
        q("insert into public.lessons (cycle_id, slug, title, position) values ($1, 'z', 'z', 9)", [cycleId]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  describe("progresso", () => {
    it("membro grava e lê o próprio progresso", async () => {
      const rows = await asUser(db, member1, () =>
        q(
          `insert into public.lesson_progress (user_id, lesson_id, status, started_at, last_position)
           values ($1, $2, 'in_progress', now(), 0.4) returning status`,
          [member1, lessonId],
        ),
      );
      expect(rows).toHaveLength(1);
      expect(await asUser(db, member1, () => q("select 1 from public.lesson_progress"))).toHaveLength(1);
    });

    it("não grava nem lê progresso de outra pessoa", async () => {
      await expect(
        asUser(db, member2, () =>
          q("insert into public.lesson_progress (user_id, lesson_id) values ($1, $2)", [member1, lessonId]),
        ),
      ).rejects.toThrow(/row-level security/);
      expect(await asUser(db, member2, () => q("select 1 from public.lesson_progress"))).toHaveLength(0);
      expect(await asUser(db, admin, () => q("select 1 from public.lesson_progress"))).toHaveLength(1);
    });

    it("não cria progresso em lição que o membro não enxerga (rascunho)", async () => {
      const draft = await createLesson("c1-l99", 99);
      await expect(
        asUser(db, member2, () =>
          q("insert into public.lesson_progress (user_id, lesson_id) values ($1, $2)", [member2, draft]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("posição de leitura fora de 0 a 1 é rejeitada", async () => {
      await expect(
        asUser(db, member1, () =>
          q("update public.lesson_progress set last_position = 1.5 where user_id = $1", [member1]),
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it("lição com progresso não pode ser apagada, só arquivada", async () => {
      await expect(
        asUser(db, admin, () => q("delete from public.lessons where id = $1", [lessonId])),
      ).rejects.toThrow(/foreign key/);
    });

    it("lição arquivada some para novos membros e continua para quem já tem progresso", async () => {
      await asUser(db, admin, () => q("update public.lessons set status = 'archived' where id = $1", [lessonId]));
      expect(await asUser(db, member1, () => q("select 1 from public.lessons where id = $1", [lessonId]))).toHaveLength(1);
      expect(
        await asUser(db, member1, () => q("select 1 from public.lesson_versions where id = $1", [versionId])),
      ).toHaveLength(1);
      expect(await asUser(db, member2, () => q("select 1 from public.lessons where id = $1", [lessonId]))).toHaveLength(0);
    });
  });
});

describe("Nossa Igreja", () => {
  it("qualquer pessoa logada lê; só o Admin escreve", async () => {
    expect((await asUser(db, member1, () => q("select 1 from public.church_pages"))).length).toBeGreaterThanOrEqual(3);
    await expect(
      asUser(db, member1, () => q("insert into public.church_pages (slug, title) values ('x', 'x')")),
    ).rejects.toThrow(/row-level security/);
    expect(
      await asUser(db, member1, () => q("update public.church_pages set body = 'x' returning slug")),
    ).toHaveLength(0);
    expect(
      await asUser(db, admin, () => q("update public.church_pages set body = 'ok' where slug = 'values' returning slug")),
    ).toHaveLength(1);
  });
});

describe("exclusão de conta (RF-27)", () => {
  it("remove dados pessoais em cascata e mantém a auditoria anonimizada", async () => {
    const admin2 = await createUser(db, "outro-admin@example.com");
    await asUser(db, admin, () => q("select public.admin_set_role($1, 'admin')", [admin2]));
    const id = await createLesson("c1-l50", 50);
    await asUser(db, admin2, () => q("update public.lessons set status = 'published' where id = $1", [id]));

    await q("delete from auth.users where id = $1", [member1]);
    expect(await q("select 1 from public.profiles where id = $1", [member1])).toHaveLength(0);
    expect(await q("select 1 from public.lesson_progress where user_id = $1", [member1])).toHaveLength(0);
    expect(await q("select 1 from public.consents where user_id = $1", [member1])).toHaveLength(0);

    await q("delete from auth.users where id = $1", [admin2]);
    const log = await q<{ actor_id: string | null }>(
      "select actor_id from public.audit_log where action = 'lesson_published' and entity_id = $1",
      [id],
    );
    expect(log).toHaveLength(1);
    expect(log[0].actor_id).toBeNull();
  });
});
