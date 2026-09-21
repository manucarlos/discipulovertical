import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { EMAIL_KINDS, TEMPLATE_LIMITS } from "@/lib/email/templates";
import { loadSettings } from "@/lib/features";
import { KIND_LABEL, STATUS_LABEL, loadNotifications, loadTemplates, setupStatus } from "@/lib/reminders/admin";
import { saveEmailTemplate, sendTestEmail } from "./actions";

export const metadata = { title: "Lembretes · Conteúdo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
      <span className={ok ? "" : "text-red-800"}>
        {children} <span className="sr-only">{ok ? "(configurado)" : "(falta configurar)"}</span>
      </span>
    </li>
  );
}

/** Lembretes por e-mail (RF-16, RF-28): situação do envio, textos editáveis e registro do que foi enviado. */
export default async function RemindersPage(props: PageProps<"/admin/lembretes">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase } = await requireAdmin();
  const [templates, notifications, settings] = await Promise.all([loadTemplates(supabase), loadNotifications(supabase), loadSettings(supabase)]);
  const status = setupStatus();
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Lembretes por e-mail</h1>
      <p className="mt-2 text-muted">
        Avisos gentis de nova lição, de retorno e de cuidado. Ninguém recebe mais de 2 lembretes por semana, só entre 8h e 20h, e só quem
        aceitou. Cada e-mail traz o link para desligar.
      </p>

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

      <section aria-labelledby="situacao" className="mt-6 rounded-2xl border border-line bg-card p-5">
        <h2 id="situacao" className="font-serif text-xl">
          Situação
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          <Check ok={settings.flags.reminders}>
            Recurso ligado em <Link href="/admin/configuracoes" className="underline">Configurações</Link>
          </Check>
          <Check ok={status.provider}>Serviço de e-mail (RESEND_API_KEY e EMAIL_FROM no site)</Check>
          <Check ok={status.cronSecret}>Segredo do agendador (CRON_SECRET no site, e o mesmo guardado no banco)</Check>
          <Check ok={status.siteUrl}>Endereço do site (NEXT_PUBLIC_SITE_URL)</Check>
        </ul>
        <p className="mt-3 text-sm text-muted">
          O passo a passo para configurar está em <strong>docs/CONTAS.md</strong>. Os valores nunca aparecem aqui.
        </p>
      </section>

      <section aria-labelledby="textos" className="mt-8">
        <h2 id="textos" className="font-serif text-2xl">
          Textos dos e-mails
        </h2>
        <p className="mt-1 text-sm text-muted">
          Use um tom de cuidado, nunca de cobrança. As palavras entre chaves, como {"{{nome}}"}, são trocadas automaticamente. O rodapé
          com o link para desligar é sempre acrescentado.
        </p>
        <div className="mt-4 space-y-6">
          {templates.map((t) => {
            const info = EMAIL_KINDS.find((k) => k.kind === t.kind)!;
            return (
              <form key={t.kind} id={`t-${t.kind}`} action={saveEmailTemplate.bind(null, t.kind)} className="space-y-3 rounded-2xl border border-line bg-card p-5">
                <div>
                  <h3 className="font-serif text-xl">{info.label}</h3>
                  <p className="text-sm text-muted">{info.when}</p>
                </div>
                <label className="block text-sm font-medium">
                  Assunto
                  <input name="subject" defaultValue={t.subject} required maxLength={TEMPLATE_LIMITS.subject} className={inputClass} />
                </label>
                <label className="block text-sm font-medium">
                  Texto
                  <textarea name="body" defaultValue={t.body} required rows={9} maxLength={TEMPLATE_LIMITS.body} className={inputClass} />
                </label>
                <p className="text-xs text-muted">Variáveis: {info.variables.map((v) => `{{${v}}}`).join("  ")}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
                    Salvar texto
                  </button>
                  <button
                    type="submit"
                    formAction={sendTestEmail.bind(null, t.kind)}
                    formNoValidate
                    className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-tint"
                  >
                    Enviar teste para mim
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="registro" className="mt-10">
        <h2 id="registro" className="font-serif text-2xl">
          Últimos envios
        </h2>
        {notifications.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum e-mail foi enviado ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <caption className="sr-only">Últimos e-mails enviados</caption>
              <thead className="bg-tint">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Quando</th>
                  <th scope="col" className="px-3 py-2 font-medium">Para</th>
                  <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                  <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{dateTime.format(new Date(n.createdAt))}</td>
                    <td className="px-3 py-2">{n.personName}</td>
                    <td className="px-3 py-2">{KIND_LABEL[n.kind]}</td>
                    <td className="px-3 py-2">
                      {STATUS_LABEL[n.status]}
                      {n.error && <span className="block text-xs text-red-800">{n.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
