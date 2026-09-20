import Link from "next/link";
import { signOut } from "@/app/actions";

export function AdminHeader({ role }: { role: "editor" | "admin" }) {
  return (
    <header className="border-b border-line bg-foreground text-background">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/admin/trilha" className="inline-flex min-h-11 items-center px-1.5 -ml-1.5 text-sm font-medium uppercase tracking-widest">
          Conteúdo · {role === "admin" ? "Administração" : "Edição"}
        </Link>
        <nav aria-label="Painel de conteúdo" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/admin/painel" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
            Painel
          </Link>
          <Link href="/admin/trilha" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
            Trilha
          </Link>
          {role === "admin" && (
            <>
              <Link href="/admin/pessoas" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
                Pessoas
              </Link>
              <Link href="/admin/igreja" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
                Nossa Igreja
              </Link>
            </>
          )}
          <Link href="/" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
            Ver como membro
          </Link>
          <form action={signOut}>
            <button type="submit" className="inline-flex min-h-11 items-center px-1.5 underline opacity-80">
              Sair
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
