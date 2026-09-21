import Link from "next/link";
import { signOut } from "@/app/actions";

export function MemberHeader({
  isStaff = false,
  isCaregiver = false,
  showCertificates = false,
  showGroups = false,
  isDiscipler = false,
}: {
  isStaff?: boolean;
  isCaregiver?: boolean;
  showCertificates?: boolean;
  showGroups?: boolean;
  isDiscipler?: boolean;
}) {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="inline-flex min-h-11 items-center px-1.5 -ml-1.5 text-sm font-medium uppercase tracking-widest text-brand">
          Vertical Church
        </Link>
        <nav aria-label="Principal" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
          <Link href="/" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
            Minha trilha
          </Link>
          <Link href="/igreja" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
            Nossa Igreja
          </Link>
          {showGroups && (
            <Link href="/grupo" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
              Meu grupo
            </Link>
          )}
          {showGroups && isDiscipler && (
            <Link href="/discipulador" className="inline-flex min-h-11 items-center px-1.5 font-medium text-brand hover:underline">
              Discipulado
            </Link>
          )}
          {showCertificates && (
            <Link href="/certificados" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
              Certificados
            </Link>
          )}
          <Link href="/perfil" className="inline-flex min-h-11 items-center px-1.5 hover:underline">
            Meu perfil
          </Link>
          {isCaregiver && (
            <Link href="/cuidado" className="inline-flex min-h-11 items-center px-1.5 font-medium text-brand hover:underline">
              Meus membros
            </Link>
          )}
          {isStaff && (
            <Link href="/admin/trilha" className="inline-flex min-h-11 items-center px-1.5 font-medium text-brand hover:underline">
              Conteúdo
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="inline-flex min-h-11 items-center px-1.5 text-muted underline">
              Sair
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
