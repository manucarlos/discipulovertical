import { connection } from "next/server";
import { requireMember } from "@/lib/auth";
import { CONSENT_TEXT } from "@/lib/legal";
import { loadBibleVersions } from "@/lib/trail/queries";
import { DeleteAccountForm, ProfileForm, RemindersForm } from "./profile-forms";

export const metadata = { title: "Meu perfil" };

const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-card p-5">
      <h2 id={id} className="font-serif text-2xl">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Meu perfil (RF-27): dados, lembretes, baixar meus dados e excluir a conta. */
export default async function ProfilePage() {
  await connection();
  const { supabase, user } = await requireMember();

  const [{ data: me }, versions, { data: consents }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, email, whatsapp, bible_version, created_at")
      .eq("id", user.id)
      .single<{ display_name: string; email: string; whatsapp: string | null; bible_version: string; created_at: string }>(),
    loadBibleVersions(supabase),
    supabase.from("consents").select("purpose, term_version, accepted_at").eq("user_id", user.id).is("revoked_at", null),
  ]);

  const active = new Map((consents ?? []).map((c) => [c.purpose as string, c]));
  const dataConsent = active.get("data_processing");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <div>
        <h1 className="font-serif text-3xl leading-tight">Meu perfil</h1>
        <p className="mt-2 text-muted">
          Entrou com <strong>{me?.email}</strong>
          {me ? ` em ${shortDate.format(new Date(me.created_at))}` : ""}.
        </p>
      </div>

      <Card id="dados" title="Meus dados">
        <ProfileForm
          defaults={{ displayName: me?.display_name ?? "", whatsapp: me?.whatsapp ?? "", bibleVersion: me?.bible_version ?? "NTLH" }}
          versions={versions.map((v) => ({ code: v.code, name: v.name }))}
        />
      </Card>

      <Card id="lembretes" title="Lembretes">
        <RemindersForm email={active.has("email_reminders")} whatsapp={active.has("whatsapp_reminders")} hasWhatsapp={Boolean(me?.whatsapp)} />
      </Card>

      <Card id="privacidade" title="Privacidade e meus direitos">
        {dataConsent ? (
          <p className="text-sm">
            Você aceitou o tratamento dos seus dados em {shortDate.format(new Date(dataConsent.accepted_at))} (termo{" "}
            {dataConsent.term_version}).
          </p>
        ) : (
          <p className="text-sm text-muted">Nenhum consentimento de dados ativo.</p>
        )}
        <p className="mt-2 text-xs text-muted">{CONSENT_TEXT.data_processing}</p>
        <p className="mt-4 text-sm">
          Você pode receber uma cópia de tudo o que guardamos sobre você, em um arquivo que abre em qualquer editor de texto.
        </p>
        {/* Arquivo para baixar: link comum (não é uma tela do app). */}
        <a
          href="/perfil/exportar"
          download
          className="mt-3 inline-block rounded-xl border border-line px-5 py-3 text-sm font-medium hover:bg-lilac"
        >
          Baixar meus dados
        </a>
      </Card>

      <Card id="excluir" title="Excluir minha conta">
        <DeleteAccountForm />
      </Card>
    </main>
  );
}
