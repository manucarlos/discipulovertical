import Link from "next/link";
import { signOut } from "@/app/actions";

export function AdminHeader({ role }: { role: "editor" | "admin" }) {
  return (
    <header className="border-b border-line bg-foreground text-background">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/admin/trilha" className="text-sm font-medium uppercase tracking-widest">
          Conteúdo · {role === "admin" ? "Administração" : "Edição"}
        </Link>
        <nav aria-label="Painel de conteúdo" className="flex items-center gap-4 text-sm">
          <Link href="/admin/trilha" className="hover:underline">
            Trilha
          </Link>
          {role === "admin" && (
            <Link href="/admin/pessoas" className="hover:underline">
              Pessoas
            </Link>
          )}
          <Link href="/" className="hover:underline">
            Ver como membro
          </Link>
          <form action={signOut}>
            <button type="submit" className="underline opacity-80">
              Sair
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
