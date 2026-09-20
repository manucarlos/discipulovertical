import Link from "next/link";

export const metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="font-serif text-3xl">Política de Privacidade</h1>
      <p className="mt-4 rounded-xl bg-lilac p-4 text-sm text-muted">
        Este texto ainda está em elaboração e passará por revisão jurídica antes do lançamento.
        Ele vai informar quais dados coletamos (nome, e-mail, foto e progresso), para quê, por quanto
        tempo guardamos, quem é o encarregado de dados e como exportar ou excluir seus dados.
      </p>
      <p className="mt-6 text-muted">
        <Link href="/login" className="underline">
          Voltar
        </Link>
      </p>
    </main>
  );
}
