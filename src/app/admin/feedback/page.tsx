import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  ALONE,
  DEVICES,
  ENTERED,
  LESSON_DONE,
  labelOf,
  summarizeFeedback,
  type Choice,
  type FeedbackRow,
} from "@/lib/feedback";
import { loadSettings } from "@/lib/features";
import { siteUrlFromEnv } from "@/lib/reminders/config";
import { deleteFeedback } from "./actions";

export const metadata = { title: "Feedback · Conteúdo" };

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Tally({ title, choices, counts, total }: { title: string; choices: Choice[]; counts: Record<string, number>; total: number }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {choices.map((c) => (
          <li key={c.value} className="flex justify-between gap-3">
            <span>{c.label}</span>
            <span className="tabular-nums text-muted">
              {counts[c.value] ?? 0} <span className="sr-only">de {total}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Text({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

/** Respostas do formulário de feedback do piloto (RF-32): resumo no alto e cada resposta abaixo. */
export default async function FeedbackAdminPage(props: PageProps<"/admin/feedback">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const erro = first(search.erro);
  const ok = first(search.ok);

  const { supabase } = await requireAdmin();
  const [{ data }, settings] = await Promise.all([
    supabase.from("feedback_responses").select("*").order("created_at", { ascending: false }).limit(200),
    loadSettings(supabase),
  ]);
  const rows = (data ?? []) as FeedbackRow[];
  const summary = summarizeFeedback(rows);

  // NEXT_PUBLIC_SITE_URL, ou o endereço de produção que a Vercel informa; sem nenhum dos dois, só o caminho.
  const site = siteUrlFromEnv();
  const link = site ? `${site}/feedback` : "/feedback";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Feedback do piloto</h1>
      <p className="mt-2 text-muted">O que os testadores contaram pelo formulário público. Só a administração vê estas respostas.</p>

      {erro && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {ok}
        </p>
      )}

      <section aria-labelledby="link-titulo" className="mt-6 rounded-2xl border border-line bg-card p-5">
        <h2 id="link-titulo" className="font-serif text-xl">
          Link para os testadores
        </h2>
        <p className="mt-2 break-all font-mono text-sm">{link}</p>
        {settings.flags.feedback ? (
          <p className="mt-2 text-sm text-emerald-900">O formulário está <strong>aberto</strong>.</p>
        ) : (
          <p className="mt-2 text-sm text-red-800">
            O formulário está <strong>fechado</strong>: quem abrir o link vê um aviso. Ligue{" "}
            <Link href="/admin/configuracoes" className="underline">
              em Configurações
            </Link>{" "}
            (&ldquo;Formulário de feedback do piloto&rdquo;).
          </p>
        )}
      </section>

      <section aria-labelledby="resumo-titulo" className="mt-6">
        <h2 id="resumo-titulo" className="font-serif text-xl">
          Resumo
        </h2>
        {summary.total === 0 ? (
          <p className="mt-2 text-muted">Ainda não há respostas.</p>
        ) : (
          <>
            <p className="mt-2">
              <strong>{summary.total}</strong> {summary.total === 1 ? "resposta" : "respostas"}. Facilidade média:{" "}
              <strong>{summary.averageEase?.toString().replace(".", ",")}</strong> de 5.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Tally title="Aparelho" choices={DEVICES} counts={summary.device} total={summary.total} />
              <Tally title="Conseguiu entrar?" choices={ENTERED} counts={summary.entered} total={summary.total} />
              <Tally title="Conseguiu concluir a 1ª lição?" choices={LESSON_DONE} counts={summary.lessonDone} total={summary.total} />
              <Tally title="Uma pessoa nova usaria sozinha?" choices={ALONE} counts={summary.alone} total={summary.total} />
            </div>
          </>
        )}
      </section>

      {rows.length > 0 && (
        <section aria-labelledby="respostas-titulo" className="mt-8">
          <h2 id="respostas-titulo" className="font-serif text-xl">
            Respostas
          </h2>
          <ul className="mt-3 space-y-4">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-muted">
                    {dateTime.format(new Date(r.created_at))} · {labelOf(DEVICES, r.device)} · facilidade{" "}
                    <strong className="text-foreground">{r.ease}/5</strong>
                  </p>
                  <form action={deleteFeedback}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="inline-flex min-h-11 items-center px-1.5 text-sm text-red-800 underline">
                      Apagar<span className="sr-only"> esta resposta</span>
                    </button>
                  </form>
                </div>
                <p className="mt-2 text-sm">
                  Entrou: <strong>{labelOf(ENTERED, r.entered)}</strong> · 1ª lição: <strong>{labelOf(LESSON_DONE, r.lesson_done)}</strong> ·
                  Novo na fé, sozinho: <strong>{labelOf(ALONE, r.alone)}</strong>
                </p>
                <dl>
                  <Text label="O que mais gostou" value={r.liked} />
                  <Text label="O que confundiu ou não funcionou" value={r.confusing} />
                  <Text label="O que gostaria que existisse" value={r.suggestion} />
                  <Text label="Contato" value={[r.contact_name, r.contact].filter(Boolean).join(" · ") || null} />
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
