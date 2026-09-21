import Link from "next/link";
import { describeActivity, formatWhatsapp } from "@/lib/admin/people";
import type { PersonReflection } from "@/lib/admin/people-queries";
import {
  ALERT_LABEL,
  NOTE_MAX,
  RESOLUTION_MAX,
  type AdminAlert,
  type AlertStatus,
  type CareCard,
  type CareMember,
  type CareNote,
  type CareOverview,
  type OpenAlert,
} from "@/lib/care";
import type { TrailView } from "@/lib/trail/view";
import { MemberStatusBadge, ProgressSection } from "./admin/people-views";

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

const ALERT_STYLE: Record<AlertStatus, string> = {
  open: "bg-red-100 text-red-800",
  in_contact: "bg-amber-100 text-amber-900",
  resolved: "bg-emerald-100 text-emerald-900",
};

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const primaryButton = "rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong";
const secondaryButton = "inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-tint";

export function AlertBadge({ status }: { status: AlertStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ALERT_STYLE[status]}`}>Alerta: {ALERT_LABEL[status]}</span>;
}

function Messages({ ok, erro }: { ok?: string; erro?: string }) {
  return (
    <>
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
    </>
  );
}

/** Botões que mudam a situação de um alerta: marcar "em contato" ou resolver (com um texto opcional). */
export function AlertControls({
  alert,
  action,
}: {
  alert: { id: string; status: AlertStatus };
  action: (formData: FormData) => Promise<void>;
}) {
  if (alert.status === "resolved") return null;
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="alert" value={alert.id} />
      <label className="block text-sm font-medium">
        Como foi o contato? (opcional, ao resolver)
        <textarea name="resolution" rows={2} maxLength={RESOLUTION_MAX} className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-2">
        {alert.status === "open" && (
          <button type="submit" name="status" value="in_contact" className={secondaryButton}>
            Marcar como em contato
          </button>
        )}
        {alert.status === "in_contact" && (
          <button type="submit" name="status" value="open" className={secondaryButton}>
            Voltar para aberto
          </button>
        )}
        <button type="submit" name="status" value="resolved" className={primaryButton}>
          Resolver alerta
        </button>
      </div>
    </form>
  );
}

/** Tela do cuidador: os membros atribuídos a ele, com quem parou primeiro. */
export function CareListView({ members, now }: { members: CareMember[]; now: Date }) {
  const stalled = members.filter((m) => m.alertId).length;
  return (
    <div>
      <h1 className="font-serif text-3xl leading-tight">Meus membros</h1>
      <p className="mt-2 text-muted">
        {members.length === 0
          ? "Você ainda não tem membros atribuídos. Quando a liderança atribuir alguém a você, a pessoa aparece aqui."
          : `${members.length} ${members.length === 1 ? "membro" : "membros"}${stalled > 0 ? `, ${stalled} com alerta` : ""}. Quem parou de vir aparece primeiro.`}
      </p>
      {members.length > 0 && (
        <ul className="mt-6 space-y-3">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/cuidado/${m.id}`} className="block rounded-2xl border border-line bg-card p-4 hover:border-brand">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.name || "(sem nome)"}</span>
                  <MemberStatusBadge status={m.status} />
                  {m.alertStatus && <AlertBadge status={m.alertStatus} />}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {m.completedLessons} lições concluídas · última atividade {describeActivity(m.lastActivityAt, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ficha do membro para o cuidador: contato, progresso, alerta, reflexões e as próprias notas de cuidado. */
export function CareMemberView({
  card,
  trail,
  now,
  alert,
  alertAction,
  notes,
  noteAction,
  deleteNoteAction,
  reflections,
  ok,
  erro,
}: {
  card: CareCard;
  trail: TrailView;
  now: Date;
  alert: OpenAlert | null;
  alertAction: (formData: FormData) => Promise<void>;
  notes: CareNote[];
  noteAction: (formData: FormData) => Promise<void>;
  deleteNoteAction: (noteId: string, formData: FormData) => Promise<void>;
  reflections: PersonReflection[] | null;
  ok?: string;
  erro?: string;
}) {
  const whatsapp = formatWhatsapp(card.whatsapp);
  const digits = card.whatsapp?.replace(/\D/g, "") ?? "";
  return (
    <div className="space-y-6">
      <div>
        <Link href="/cuidado" className="text-sm text-muted underline">
          ← Meus membros
        </Link>
        <h1 className="mt-3 font-serif text-3xl leading-tight">{card.name || "(sem nome)"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MemberStatusBadge status={card.status} />
          {alert && <AlertBadge status={alert.status} />}
        </div>
      </div>

      <Messages ok={ok} erro={erro} />

      <section aria-labelledby="contato" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="contato" className="font-serif text-xl">
          Contato
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">E-mail</dt>
            <dd>{card.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">WhatsApp</dt>
            <dd>
              {whatsapp ? (
                <a
                  href={`https://wa.me/${digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  aria-label={`Abrir conversa no WhatsApp com ${card.name} (abre em nova aba)`}
                >
                  {whatsapp}
                </a>
              ) : (
                <span className="text-muted">não informado</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Última atividade</dt>
            <dd>{card.lastActivityAt ? `${describeActivity(card.lastActivityAt, now)} (${dateTime.format(new Date(card.lastActivityAt))})` : "nenhuma"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Versão da Bíblia</dt>
            <dd>{card.bibleVersion}</dd>
          </div>
        </dl>
      </section>

      {alert && (
        <section aria-labelledby="alerta" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
          <h2 id="alerta" className="font-serif text-xl">
            Pedido de contato
          </h2>
          <p className="mt-1 text-sm">
            Esta pessoa está há mais de 14 dias sem ler. Alerta aberto em {shortDate.format(new Date(alert.openedAt))}. Um contato pessoal
            costuma ajudar mais do que qualquer lembrete.
          </p>
          <AlertControls alert={alert} action={alertAction} />
        </section>
      )}

      <ProgressSection trail={trail} now={now} />

      {reflections && (
        <section aria-labelledby="reflexoes" className="rounded-2xl border border-line bg-card p-5">
          <h2 id="reflexoes" className="font-serif text-xl">
            Reflexões
          </h2>
          <p className="mt-1 text-sm text-muted">Textos privados escritos pela pessoa. Trate com cuidado; cada consulta fica registrada.</p>
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

      <section aria-labelledby="notas" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="notas" className="font-serif text-xl">
          Notas de cuidado
        </h2>
        <p className="mt-1 text-sm text-muted">Só você e a administração leem estas notas. Não escreva nada que não possa ser lido pelo pastor.</p>
        <form action={noteAction} className="mt-3 space-y-2">
          <label htmlFor="nova-nota" className="block text-sm font-medium">
            Nova nota
          </label>
          <textarea id="nova-nota" name="body" rows={3} maxLength={NOTE_MAX} required className={inputClass} />
          <button type="submit" className={primaryButton}>
            Salvar nota
          </button>
        </form>
        {notes.length > 0 && (
          <ul className="mt-5 space-y-4">
            {notes.map((n) => (
              <li key={n.id} className="border-t border-line pt-3">
                <p className="whitespace-pre-line text-sm">{n.body}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                  {dateTime.format(new Date(n.createdAt))}
                  <form action={deleteNoteAction.bind(null, n.id)}>
                    <button type="submit" className="inline-flex min-h-11 items-center underline">
                      Apagar nota
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---- Administração -------------------------------------------------------------------------

/** Tela do Admin: fila de quem está sem cuidador, rodízio, carga dos cuidadores e alertas em aberto. */
export function CareAdminView({
  overview,
  now,
  assignAction,
  autoAssignAction,
  alertAction,
  enabled,
  ok,
  erro,
}: {
  overview: CareOverview;
  now: Date;
  assignAction: (memberId: string, formData: FormData) => Promise<void>;
  autoAssignAction: () => Promise<void>;
  alertAction: (memberId: string, formData: FormData) => Promise<void>;
  enabled: boolean;
  ok?: string;
  erro?: string;
}) {
  const { queue, caregivers, alerts } = overview;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl leading-tight">Cuidado</h1>
        <p className="mt-2 text-muted">
          Cada membro tem um cuidador, que o acompanha e faz o contato quando ele para de ler. Para uma pessoa virar cuidadora, mude o perfil
          dela em <Link href="/admin/pessoas" className="underline">Pessoas</Link>.
        </p>
      </div>

      {!enabled && (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          O recurso <strong>Cuidadores e alertas</strong> está desligado: os cuidadores ainda não veem ninguém. Você já pode organizar as
          atribuições; para começar a valer, ligue-o em <Link href="/admin/configuracoes" className="underline">Configurações</Link>.
        </p>
      )}
      <Messages ok={ok} erro={erro} />

      <section aria-labelledby="alertas" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="alertas" className="font-serif text-xl">
          Alertas de quem parou
        </h2>
        {alerts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum alerta em aberto.</p>
        ) : (
          <ul className="mt-3 space-y-5">
            {alerts.map((a: AdminAlert) => (
              <li key={a.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/pessoas/${a.memberId}`} className="font-medium underline">
                    {a.memberName}
                  </Link>
                  <AlertBadge status={a.status} />
                </p>
                <p className="mt-1 text-sm text-muted">
                  Parado desde {shortDate.format(new Date(a.openedAt))} · {a.caregiverName ? `cuidador: ${a.caregiverName}` : "sem cuidador (você cuida deste)"}
                </p>
                <AlertControls alert={a} action={alertAction.bind(null, a.memberId)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fila" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="fila" className="font-serif text-xl">
          Sem cuidador ({queue.length})
        </h2>
        {queue.length > 0 && caregivers.length > 0 && (
          <form action={autoAssignAction} className="mt-3">
            <button type="submit" className={primaryButton}>
              Distribuir por rodízio
            </button>
            <p className="mt-1 text-sm text-muted">Cada membro vai para o cuidador que tem menos membros.</p>
          </form>
        )}
        {caregivers.length === 0 && (
          <p className="mt-3 text-sm text-muted">Ainda não há nenhum cuidador. Dê o perfil de Cuidador a alguém em Pessoas.</p>
        )}
        {queue.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Todos os membros têm cuidador.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {queue.map((m) => (
              <li key={m.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/pessoas/${m.id}`} className="font-medium underline">
                    {m.name || m.email}
                  </Link>
                  <MemberStatusBadge status={m.status} />
                </p>
                <p className="text-sm text-muted">Última atividade {describeActivity(m.lastActivityAt, now)}</p>
                {caregivers.length > 0 && (
                  <form action={assignAction.bind(null, m.id)} className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="min-w-44 flex-1 text-sm font-medium">
                      Cuidador
                      <select name="caregiver" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Escolha…
                        </option>
                        {caregivers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.members})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className={secondaryButton}>
                      Atribuir
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="carga" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="carga" className="font-serif text-xl">
          Cuidadores
        </h2>
        {caregivers.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum cuidador cadastrado.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {caregivers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span>{c.name}</span>
                <span className="text-muted">
                  {c.members} {c.members === 1 ? "membro" : "membros"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
