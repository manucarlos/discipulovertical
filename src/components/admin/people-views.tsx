import Link from "next/link";
import {
  AUDIT_LABEL,
  CONSENT_LABEL,
  describeActivity,
  formatWhatsapp,
  PAGE_SIZE,
  peopleQueryString,
  ROLE_HINT,
  ROLE_LABEL,
  ROLES,
  STATUS_LABEL,
  STATUSES,
  type MemberStatus,
  type PeopleFilters,
  type PersonRow,
  type UserRole,
} from "@/lib/admin/people";
import type { PersonDetail, PersonReflection } from "@/lib/admin/people-queries";
import type { AuthoredNote } from "@/lib/care";
import { lockedMessage } from "@/lib/trail/format";
import type { TrailView } from "@/lib/trail/view";

const TIME_ZONE = "America/Sao_Paulo";
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_STYLE: Record<MemberStatus, string> = {
  onboarding_pending: "bg-zinc-200 text-zinc-700",
  not_started: "bg-lilac text-foreground",
  in_progress: "bg-amber-100 text-amber-900",
  stalled: "bg-red-100 text-red-800",
  completed: "bg-emerald-100 text-emerald-900",
};

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function RoleBadge({ role }: { role: UserRole }) {
  if (role === "member") return null;
  return <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-on-brand">{ROLE_LABEL[role]}</span>;
}

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";

/** Lista de pessoas (RF-23): busca, filtros por perfil e situação, e paginação. */
export function PeopleListView({
  rows,
  total,
  filters,
  now,
  basePath = "/admin/pessoas",
}: {
  rows: PersonRow[];
  total: number;
  filters: PeopleFilters;
  now: Date;
  basePath?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(filters.search || filters.role || filters.status);

  return (
    <div>
      <h1 className="font-serif text-3xl leading-tight">Pessoas</h1>
      <p className="mt-2 text-muted">
        Quem está na plataforma, em que etapa cada um está e quem está parado. Dados pessoais: visíveis só para administradores.
      </p>

      <form method="get" action={basePath} className="mt-6 grid gap-3 rounded-2xl border border-line bg-card p-4 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">
          Buscar por nome ou e-mail
          <input name="q" defaultValue={filters.search} maxLength={100} className={inputClass} placeholder="Ex.: Maria" />
        </label>
        <label className="block text-sm font-medium">
          Situação
          <select name="situacao" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">Todas</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Perfil
          <select name="papel" defaultValue={filters.role ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
            Filtrar
          </button>
          {filtered && (
            <Link href={basePath} className="text-sm underline">
              Limpar filtros
            </Link>
          )}
        </div>
      </form>

      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {total === 0 ? "Nenhuma pessoa encontrada." : `${total} ${total === 1 ? "pessoa" : "pessoas"}${filtered ? " com estes filtros" : ""}`}
        {total > 0 && pages > 1 && ` · página ${filters.page} de ${pages}`}
      </p>

      <ul className="mt-3 space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`${basePath}/${p.id}`}
              className="block rounded-2xl border border-line bg-card p-4 transition hover:border-brand"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name || "(sem nome)"}</span>
                  <span className="block truncate text-sm text-muted">{p.email}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <RoleBadge role={p.role} />
                  <MemberStatusBadge status={p.status} />
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                {p.completedLessons} {p.completedLessons === 1 ? "lição concluída" : "lições concluídas"} ·{" "}
                {p.lastActivityAt ? `última atividade ${describeActivity(p.lastActivityAt, now)}` : "ainda sem atividade"}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 && filters.page > 1 && (
        <p className="mt-4 text-sm">
          Esta página está vazia.{" "}
          <Link href={`${basePath}${peopleQueryString(filters, 1)}`} className="underline">
            Voltar à primeira
          </Link>
        </p>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-6 flex items-center justify-between">
          {filters.page > 1 ? (
            <Link href={`${basePath}${peopleQueryString(filters, filters.page - 1)}`} className="rounded-xl border border-line px-4 py-2 text-sm hover:bg-lilac">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          {filters.page < pages ? (
            <Link href={`${basePath}${peopleQueryString(filters, filters.page + 1)}`} className="rounded-xl border border-line px-4 py-2 text-sm hover:bg-lilac">
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

const LESSON_STATE_LABEL = { completed: "Concluída", in_progress: "Em andamento", available: "Disponível" } as const;
const LESSON_STATE_STYLE = {
  completed: "bg-emerald-100 text-emerald-900",
  in_progress: "bg-amber-100 text-amber-900",
  available: "bg-lilac text-foreground",
  locked: "bg-transparent text-muted",
} as const;

/** Progresso lição a lição de uma pessoa, ciclo por ciclo. Usada na ficha do Admin e na do cuidador. */
export function ProgressSection({ trail, now }: { trail: TrailView; now: Date }) {
  return (
    <section aria-labelledby="progresso" className="rounded-2xl border border-line bg-card p-5">
      <h2 id="progresso" className="font-serif text-xl">
        Progresso
      </h2>
      {trail.cycles.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ainda não há lições publicadas.</p>
      ) : (
        <div className="mt-3 space-y-5">
          {trail.cycles.map((cycle) => (
            <div key={cycle.id}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-medium">
                  {cycle.position}. {cycle.title}
                </h3>
                <span className="text-sm text-muted">
                  {cycle.completedCount} de {cycle.requiredCount} · {cycle.percent}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`Progresso no ciclo ${cycle.title}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={cycle.percent}
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-lilac"
              >
                <div className="h-full rounded-full bg-brand" style={{ width: `${cycle.percent}%` }} />
              </div>
              <ol className="mt-2 space-y-1">
                {cycle.lessons.map((l) => {
                  const s = l.state;
                  const text =
                    s.state === "locked"
                      ? lockedMessage(s, now)
                      : s.state === "completed"
                        ? `Concluída em ${shortDate.format(s.completedAt)}`
                        : LESSON_STATE_LABEL[s.state];
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className={`min-w-0 truncate ${s.state === "locked" ? "text-muted" : ""}`}>
                        {l.position}. {l.title}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${LESSON_STATE_STYLE[s.state]}`}>{text}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Ficha da pessoa (RF-24): dados, perfil de acesso, progresso lição a lição, consentimentos e histórico. */
export function PersonDetailView({
  detail,
  trail,
  now,
  isSelf,
  roleAction,
  ok,
  erro,
  reflections = null,
  care = null,
  careNotes = null,
  backHref = "/admin/pessoas",
}: {
  detail: PersonDetail;
  trail: TrailView;
  now: Date;
  isSelf: boolean;
  roleAction: (formData: FormData) => Promise<void>;
  ok?: string;
  erro?: string;
  /** Reflexões da pessoa (RN-03). `null` quando o recurso está desligado: a seção nem aparece. */
  reflections?: PersonReflection[] | null;
  /** Cuidador atual e quem pode receber a pessoa. `null` para quem não recebe cuidador (equipe). */
  care?: {
    caregivers: { id: string; name: string }[];
    currentId: string | null;
    assignAction: (formData: FormData) => Promise<void>;
    unassignAction: (formData: FormData) => Promise<void>;
  } | null;
  /** Notas de cuidado escritas sobre a pessoa. `null` com o recurso desligado. */
  careNotes?: AuthoredNote[] | null;
  backHref?: string;
}) {
  const p = detail.summary;
  const whatsapp = formatWhatsapp(detail.whatsapp);

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-muted underline">
          ← Pessoas
        </Link>
        <h1 className="mt-3 font-serif text-3xl leading-tight">{p.name || "(sem nome)"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MemberStatusBadge status={p.status} />
          <RoleBadge role={p.role} />
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {ok}
        </p>
      )}

      <section aria-labelledby="dados" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="dados" className="font-serif text-xl">
          Dados
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <Fact label="E-mail">{p.email}</Fact>
          <Fact label="WhatsApp">{whatsapp ?? <span className="text-muted">não informado</span>}</Fact>
          <Fact label="Versão da Bíblia">{detail.bibleVersion}</Fact>
          <Fact label="Entrou em">{shortDate.format(new Date(p.createdAt))}</Fact>
          <Fact label="Primeiro acesso concluído">
            {p.onboardedAt ? shortDate.format(new Date(p.onboardedAt)) : <span className="text-muted">ainda não</span>}
          </Fact>
          <Fact label="Última atividade">
            {p.lastActivityAt ? `${describeActivity(p.lastActivityAt, now)} (${dateTime.format(new Date(p.lastActivityAt))})` : "nenhuma"}
          </Fact>
        </dl>
      </section>

      <section aria-labelledby="perfil" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="perfil" className="font-serif text-xl">
          Perfil de acesso
        </h2>
        {isSelf ? (
          <p className="mt-3 text-sm text-muted">Este é o seu perfil ({ROLE_LABEL[p.role]}). Para alterá-lo, peça a outro administrador.</p>
        ) : (
          <form action={roleAction} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1 text-sm font-medium">
              Perfil
              <select name="role" defaultValue={p.role} className={inputClass}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
              Salvar perfil
            </button>
          </form>
        )}
        <dl className="mt-4 space-y-2 text-sm">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="inline font-medium">{ROLE_LABEL[r]}: </dt>
              <dd className="inline text-muted">{ROLE_HINT[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {care && (
        <section aria-labelledby="cuidador" className="rounded-2xl border border-line bg-card p-5">
          <h2 id="cuidador" className="font-serif text-xl">
            Cuidador
          </h2>
          {care.caregivers.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Ainda não há cuidadores. Dê o perfil de Cuidador a alguém para poder atribuir.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                {care.currentId ? `Atual: ${care.caregivers.find((c) => c.id === care.currentId)?.name ?? "—"}.` : "Sem cuidador no momento."}
              </p>
              <form action={care.assignAction} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="from" value={`/admin/pessoas/${p.id}`} />
                <label className="min-w-48 flex-1 text-sm font-medium">
                  Atribuir a
                  <select name="caregiver" defaultValue={care.currentId ?? ""} required className={inputClass}>
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {care.caregivers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
                  Salvar cuidador
                </button>
              </form>
              {care.currentId && (
                <form action={care.unassignAction} className="mt-2">
                  <input type="hidden" name="from" value={`/admin/pessoas/${p.id}`} />
                  <button type="submit" className="inline-flex min-h-11 items-center text-sm underline">
                    Tirar cuidador
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      )}

      <ProgressSection trail={trail} now={now} />

      {reflections && (
        <section aria-labelledby="reflexoes" className="rounded-2xl border border-line bg-card p-5">
          <h2 id="reflexoes" className="font-serif text-xl">
            Reflexões
          </h2>
          <p className="mt-1 text-sm text-muted">Textos privados escritos pela pessoa. Cada consulta fica registrada.</p>
          {reflections.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhuma reflexão escrita.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {reflections.map((r) => (
                <li key={r.lessonSlug}>
                  <p className="text-sm font-medium">
                    {r.lessonTitle} <span className="font-normal text-muted">· {shortDate.format(new Date(r.updatedAt))}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {careNotes && (
        <section aria-labelledby="notas-cuidado" className="rounded-2xl border border-line bg-card p-5">
          <h2 id="notas-cuidado" className="font-serif text-xl">
            Notas de cuidado
          </h2>
          {careNotes.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhuma nota registrada.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {careNotes.map((n) => (
                <li key={n.id}>
                  <p className="whitespace-pre-line text-sm">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {dateTime.format(new Date(n.createdAt))}
                    {n.authorName ? ` · por ${n.authorName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="consentimentos" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="consentimentos" className="font-serif text-xl">
          Consentimentos (LGPD)
        </h2>
        {detail.consents.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum consentimento registrado.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {detail.consents.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span>{CONSENT_LABEL[c.purpose] ?? c.purpose}</span>
                <span className={c.revokedAt ? "text-red-800" : "text-muted"}>
                  {c.revokedAt
                    ? `revogado em ${shortDate.format(new Date(c.revokedAt))}`
                    : `aceito em ${shortDate.format(new Date(c.acceptedAt))} (termo ${c.termVersion})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="historico" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="historico" className="font-serif text-xl">
          Histórico de perfil
        </h2>
        {detail.history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhuma mudança de perfil registrada.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {detail.history.map((h, i) => {
              const from = typeof h.details.from === "string" ? ROLE_LABEL[h.details.from as UserRole] : null;
              const to = typeof h.details.to === "string" ? ROLE_LABEL[h.details.to as UserRole] : null;
              return (
                <li key={i}>
                  <span className="font-medium">{AUDIT_LABEL[h.action] ?? h.action}</span>
                  {from && to && ` · ${from} → ${to}`}
                  <span className="block text-muted">
                    {dateTime.format(new Date(h.createdAt))}
                    {h.actorName ? ` · por ${h.actorName}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
