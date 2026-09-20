import Link from "next/link";
import { formatPercent, PERIODS, percent, topAbandonment, type Dashboard, type LessonMetric } from "@/lib/admin/dashboard";
import { STATUS_LABEL, type MemberStatus } from "@/lib/admin/people";

/**
 * Forma de cada dado (guia de visualização):
 *  - números isolados: blocos de número, não gráficos;
 *  - onde as pessoas estão: barras horizontais com ÊNFASE (uma cor de destaque para "parados", cinza para o resto);
 *  - funil por lição e por ciclo: tabela com barra dentro da célula, então todo valor também está em texto.
 * Uma cor só (a da igreja), sem arco-íris. Barras finas, com ponta arredondada.
 */

function Bar({ value, max, emphasis = false, label }: { value: number; max: number; emphasis?: boolean; label: string }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role="img" aria-label={label} title={label} className="h-2 w-full overflow-hidden rounded-full bg-lilac">
      <div
        className={`h-full rounded-full ${emphasis ? "bg-brand" : "bg-zinc-400"}`}
        style={{ width: `${width}%`, minWidth: value > 0 ? "0.5rem" : 0 }}
      />
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-sans text-4xl font-semibold leading-none">{value}</dd>
      {detail && <p className="mt-2 text-xs text-muted">{detail}</p>}
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="font-serif text-2xl">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const SITUATION_ORDER: MemberStatus[] = ["stalled", "in_progress", "not_started", "onboarding_pending", "completed"];

function Situations({ data, peopleHref }: { data: Dashboard; peopleHref: string }) {
  const total = data.membersTotal;
  return (
    <Section id="situacoes" title="Onde as pessoas estão" hint="Só membros. Quem está parado há 14 dias ou mais precisa de um contato pessoal.">
      {total === 0 ? (
        <p className="text-sm text-muted">Ainda não há membros.</p>
      ) : (
        <ul className="space-y-3">
          {SITUATION_ORDER.map((status) => {
            const n = data.situations[status];
            const stalled = status === "stalled";
            return (
              <li key={status}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={stalled ? "font-medium text-brand" : ""}>
                    {stalled && <span aria-hidden="true">⚠ </span>}
                    {STATUS_LABEL[status]}
                  </span>
                  <span className={stalled ? "font-medium" : "text-muted"}>
                    {n} <span className="text-muted">({formatPercent(n, total)})</span>
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={n} max={total} emphasis={stalled} label={`${STATUS_LABEL[status]}: ${n} de ${total} membros`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.situations.stalled > 0 && (
        <Link href={peopleHref} className="mt-4 inline-flex min-h-11 items-center text-sm underline">
          Ver quem está parado →
        </Link>
      )}
    </Section>
  );
}

function CyclesTable({ data }: { data: Dashboard }) {
  return (
    <Section id="ciclos" title="Ciclos" hint="Conclusão = todas as lições obrigatórias do ciclo concluídas.">
      {data.cycles.length === 0 ? (
        <p className="text-sm text-muted">Ainda não há ciclos com lições publicadas.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <caption className="sr-only">Membros que começaram e concluíram cada ciclo</caption>
            <thead className="bg-lilac">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Ciclo</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Começaram</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Concluíram</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Taxa</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Tempo médio</th>
              </tr>
            </thead>
            <tbody>
              {data.cycles.map((c) => (
                <tr key={c.slug} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {c.position}. {c.title}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{c.started_members}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.completed_members}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(c.completed_members, c.started_members)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.avg_days === null ? "—" : `${c.avg_days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function AbandonmentList({ lessons }: { lessons: LessonMetric[] }) {
  const top = topAbandonment(lessons);
  const max = Math.max(1, ...top.map((l) => l.stalled_here));
  return (
    <Section id="abandono" title="Onde mais gente parou" hint="Lições em que alguém começou e não volta há 14 dias ou mais. Boas candidatas a revisão do texto.">
      {top.length === 0 ? (
        <p className="text-sm text-muted">Ninguém está parado em nenhuma lição.</p>
      ) : (
        <ol className="space-y-3">
          {top.map((l) => (
            <li key={l.slug}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-muted">Ciclo {l.cycle_position}, lição {l.position} · </span>
                  {l.title}
                </span>
                <span className="shrink-0 font-medium">
                  {l.stalled_here} {l.stalled_here === 1 ? "pessoa" : "pessoas"}
                </span>
              </div>
              <div className="mt-1">
                <Bar value={l.stalled_here} max={max} emphasis label={`${l.stalled_here} de ${l.started} que começaram estão parados aqui`} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export function LessonFunnel({ lessons }: { lessons: LessonMetric[] }) {
  const cycles = [...new Map(lessons.map((l) => [l.cycle_slug, l.cycle_position])).entries()].sort((a, b) => a[1] - b[1]);
  return (
    <Section id="funil" title="Lição por lição" hint="Quantas pessoas iniciaram e concluíram cada lição. A barra mostra a parte que concluiu, entre as que iniciaram.">
      {lessons.length === 0 ? (
        <p className="text-sm text-muted">Ainda não há lições publicadas.</p>
      ) : (
        <div className="space-y-6">
          {cycles.map(([slug, position]) => (
            <div key={slug} className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <caption className="bg-lilac px-3 py-2 text-left font-medium">Ciclo {position}</caption>
                <thead>
                  <tr className="text-muted">
                    <th scope="col" className="px-3 py-2 font-normal">Lição</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">Iniciaram</th>
                    <th scope="col" className="w-40 px-3 py-2 font-normal">Concluíram</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">Pararam aqui</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons
                    .filter((l) => l.cycle_slug === slug)
                    .map((l) => (
                      <tr key={l.slug} className="border-t border-line">
                        <th scope="row" className="px-3 py-2 font-normal">
                          <span className="text-muted">{l.position}. </span>
                          {l.title}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">{l.started}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-full">
                              <Bar value={l.completed} max={l.started} emphasis label={`${l.completed} de ${l.started} concluíram`} />
                            </div>
                            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
                              {l.completed} ({formatPercent(l.completed, l.started)})
                            </span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${l.stalled_here > 0 ? "font-medium text-brand" : "text-muted"}`}>
                          {l.stalled_here}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Painel do Admin: números-chave, onde as pessoas estão, ciclos e funil. */
export function DashboardView({ data, basePath = "/admin/painel", peopleHref = "/admin/pessoas?situacao=stalled" }: { data: Dashboard; basePath?: string; peopleHref?: string }) {
  const start = data.startWithin7Days;
  const vision = data.vision;
  const generated = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data.generatedAt));

  return (
    <div>
      <h1 className="font-serif text-3xl leading-tight">Painel</h1>
      <p className="mt-2 text-muted">Como está a caminhada das pessoas. Atualizado em {generated}.</p>

      <nav aria-label="Período" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Período dos novos:</span>
        {PERIODS.map((d) => (
          <Link
            key={d}
            href={`${basePath}?dias=${d}`}
            aria-current={d === data.periodDays ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 ${d === data.periodDays ? "border-brand bg-brand text-on-brand" : "border-line hover:bg-lilac"}`}
          >
            {d} dias
          </Link>
        ))}
      </nav>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={`Novos em ${data.periodDays} dias`} value={String(data.newInPeriod)} detail={`${data.membersTotal} membros no total`} />
        <Tile
          label="Começaram em até 7 dias"
          value={formatPercent(start.started, start.eligible)}
          detail={start.eligible === 0 ? "Ainda sem quem chegou há 7 dias ou mais" : `${start.started} de ${start.eligible} que chegaram no período`}
        />
        <Tile label="Parados" value={String(data.situations.stalled)} detail="14 dias ou mais sem atividade" />
        <Tile label="Concluíram a trilha" value={String(data.situations.completed)} detail="todas as lições obrigatórias" />
        <Tile
          label="Conhecem a visão"
          value={vision.lessons === 0 ? "—" : formatPercent(vision.membersKnowing, vision.membersTotal)}
          detail={vision.lessons === 0 ? "Nenhuma lição com a etiqueta “visão”" : `${vision.membersKnowing} de ${vision.membersTotal} concluíram as ${vision.lessons} lições sobre a visão`}
        />
      </dl>

      <Situations data={data} peopleHref={peopleHref} />
      <CyclesTable data={data} />
      <AbandonmentList lessons={data.lessons} />
      <LessonFunnel lessons={data.lessons} />

      <details className="mt-10 rounded-xl border border-line p-4 text-sm">
        <summary className="-my-2 cursor-pointer py-2 font-medium">Como cada número é calculado</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
          <li>Só contam <strong>membros</strong>: Administradores e Editores ficam de fora.</li>
          <li><strong>Começaram em até 7 dias:</strong> entre quem chegou no período (e já teve 7 dias), quem concluiu a primeira lição em até 7 dias depois de entrar.</li>
          <li><strong>Parado:</strong> 14 dias ou mais sem abrir, ler ou concluir uma lição (quem nunca começou conta desde o primeiro acesso).</li>
          <li><strong>Conclusão do ciclo:</strong> todas as lições obrigatórias do ciclo concluídas. <strong>Tempo médio:</strong> da primeira abertura à última conclusão, só de quem concluiu.</li>
          <li><strong>Conhecem a visão:</strong> concluíram todas as lições com a etiqueta “visão”.</li>
          <li><strong>Pararam aqui:</strong> começaram a lição e não voltam há 14 dias ou mais.</li>
        </ul>
      </details>
    </div>
  );
}

/** Painel do Editor: só o que é de conteúdo, sem nenhum dado de pessoas. */
export function ContentMetricsView({ lessons }: { lessons: LessonMetric[] }) {
  return (
    <div>
      <h1 className="font-serif text-3xl leading-tight">Painel de conteúdo</h1>
      <p className="mt-2 text-muted">
        Como as lições estão funcionando. Não mostra dados de pessoas; os indicadores completos são só do administrador.
      </p>
      <AbandonmentList lessons={lessons} />
      <LessonFunnel lessons={lessons} />
    </div>
  );
}

// Reexportado para os testes de tela.
export { percent };
