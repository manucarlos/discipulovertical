"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { signOut } from "@/app/actions";

interface NavItem {
  href: string;
  label: string;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const PESSOAS: NavGroup = {
  label: "Pessoas",
  items: [
    { href: "/admin/pessoas", label: "Pessoas" },
    { href: "/admin/cuidado", label: "Cuidado" },
    { href: "/admin/grupos", label: "Grupos" },
    { href: "/admin/encerramentos", label: "Encerramentos" },
  ],
};
const COMUNICACAO: NavGroup = {
  label: "Comunicação",
  items: [
    { href: "/admin/lembretes", label: "Lembretes" },
    { href: "/admin/feedback", label: "Feedback" },
  ],
};
const IGREJA: NavGroup = {
  label: "Igreja",
  items: [
    { href: "/admin/marca", label: "Marca" },
    { href: "/admin/igreja", label: "Nossa Igreja" },
    { href: "/admin/configuracoes", label: "Configurações" },
  ],
};

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" width={22} height={22} aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" width={22} height={22} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Menu de administração (RF-23 e afins): gaveta lateral agrupada por assunto — pensada para celular, onde a maior parte do acesso acontece. */
export function AdminHeader({ role }: { role: "editor" | "admin" }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  // Fecha ao navegar. Ajuste durante a renderização (não um efeito): evita um re-render em cascata só para
  // fechar a gaveta (guia do React para "resetar estado quando uma prop muda").
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = role === "admin" ? [PESSOAS, COMUNICACAO, IGREJA] : [];
  const itemCls = "block min-h-11 rounded-lg px-3 py-2.5 text-sm leading-none hover:bg-background/10";

  return (
    <header className="border-b border-line bg-foreground text-background">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/admin/painel" className="inline-flex min-h-11 items-center px-1.5 -ml-1.5 text-sm font-medium uppercase tracking-widest">
          Conteúdo · {role === "admin" ? "Administração" : "Edição"}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
          className="-mr-1.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-background/10"
        >
          {open ? <CloseIcon /> : <HamburgerIcon />}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <nav
            id={panelId}
            aria-label="Menu de administração"
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-foreground p-4 text-background"
          >
            <Link href="/admin/painel" className={`${itemCls} font-medium`}>
              Painel
            </Link>
            <Link href="/admin/trilha" className={`${itemCls} font-medium`}>
              Trilha
            </Link>

            {groups.map((group) => (
              <div key={group.label} className="mt-4">
                <p className="px-3 text-xs font-medium uppercase tracking-widest text-background/60">{group.label}</p>
                <div className="mt-1">
                  {group.items.map((item) => (
                    <Link key={item.href} href={item.href} className={itemCls}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-auto space-y-1 border-t border-background/15 pt-3">
              <Link href="/" className={itemCls}>
                Ver como membro
              </Link>
              <form action={signOut}>
                <button type="submit" className={`${itemCls} w-full text-left underline`}>
                  Sair
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
