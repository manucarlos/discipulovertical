import Link from "next/link";
import { signOut } from "@/app/actions";

export function MemberHeader() {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-sm font-medium uppercase tracking-widest text-brand">
          Vertical Church
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:underline">
            Minha trilha
          </Link>
          <Link href="/igreja" className="hover:underline">
            Nossa Igreja
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-muted underline">
              Sair
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
