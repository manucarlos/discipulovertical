"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

type FontSize = "sm" | "md" | "lg";
type Theme = "light" | "dark";

const FONT_CLASS: Record<FontSize, string> = { sm: "text-base", md: "text-lg", lg: "text-xl" };
const PREFS_KEY = "vd:reading-prefs";
const SAVE_DELAY_MS = 1500;
const SAVE_MIN_DELTA = 0.02;

interface Props {
  /** Até onde a pessoa já leu (0 a 1), para retomar. */
  initialPosition: number | null;
  completed: boolean;
  /** Registra a abertura da lição. Ausente na pré-visualização de desenvolvimento. */
  openAction?: () => Promise<void>;
  saveAction?: (position: number) => Promise<void>;
  children: ReactNode;
}

interface Prefs {
  font: FontSize;
  theme: Theme;
}
const DEFAULT_PREFS: Prefs = { font: "md", theme: "light" };

/**
 * Preferências de leitura guardadas neste aparelho (localStorage). É um pequeno "store" externo:
 * o servidor e a primeira renderização usam o padrão, e o cliente passa a ler o valor salvo sem
 * divergência de hidratação. Se o armazenamento falhar (aba privada, bloqueio), vale só nesta visita.
 */
const prefListeners = new Set<() => void>();
let memoryPrefs = "";

function subscribePrefs(listener: () => void) {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
}
function getPrefsSnapshot(): string {
  try {
    return window.localStorage.getItem(PREFS_KEY) ?? memoryPrefs;
  } catch {
    return memoryPrefs;
  }
}
function getServerPrefsSnapshot(): string {
  return "";
}
function savePrefs(prefs: Prefs) {
  memoryPrefs = JSON.stringify(prefs);
  try {
    window.localStorage.setItem(PREFS_KEY, memoryPrefs);
  } catch {
    // Sem armazenamento: as preferências valem só nesta visita.
  }
  prefListeners.forEach((listener) => listener());
}
function parsePrefs(raw: string): Prefs {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return {
      font: value.font && value.font in FONT_CLASS ? value.font : DEFAULT_PREFS.font,
      theme: value.theme === "dark" ? "dark" : "light",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** RF-08 e RF-09: controles de leitura (fonte, modo escuro), barra de progresso e retomada do ponto. */
export function ReadingShell({ initialPosition, completed, openAction, saveAction, children }: Props) {
  const rawPrefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getServerPrefsSnapshot);
  const { font, theme } = useMemo(() => parsePrefs(rawPrefs), [rawPrefs]);
  const [progress, setProgress] = useState(0);
  const [resumed, setResumed] = useState(false);

  const progressRef = useRef(0);
  const lastSaved = useRef(initialPosition ?? 0);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = progressRef.current;
    if (!saveAction || completed || !ready.current) return;
    if (Math.abs(p - lastSaved.current) < SAVE_MIN_DELTA) return;
    lastSaved.current = p;
    saveAction(p).catch(() => {});
  }, [saveAction, completed]);

  // Abre a lição e retoma de onde parou.
  useEffect(() => {
    if (!completed) openAction?.().catch(() => {});

    const canResume = !completed && initialPosition !== null && initialPosition > 0.03 && initialPosition < 0.97;
    const frame = requestAnimationFrame(() => {
      if (canResume) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: max * initialPosition, behavior: "auto" });
        setResumed(true);
      }
      // Só passa a gravar depois da retomada, para o pulo inicial não sobrescrever a posição.
      setTimeout(() => {
        ready.current = true;
      }, 400);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deve rodar uma vez, ao abrir a lição
  }, []);

  // Barra de progresso e gravação da posição.
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progressRef.current = p;
      setProgress(p);
      if (ready.current) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const changeFont = (next: FontSize) => savePrefs({ font: next, theme });
  const toggleTheme = () => savePrefs({ font, theme: theme === "dark" ? "light" : "dark" });

  const sizes: { id: FontSize; label: string; aria: string; cls: string }[] = [
    { id: "sm", label: "A", aria: "Letra pequena", cls: "text-sm" },
    { id: "md", label: "A", aria: "Letra média", cls: "text-base" },
    { id: "lg", label: "A", aria: "Letra grande", cls: "text-xl" },
  ];

  return (
    <div className={`${theme === "dark" ? "reading-dark" : ""} bg-background text-foreground transition-colors`}>
      <div
        role="progressbar"
        aria-label="Progresso da leitura"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="fixed left-0 top-0 z-50 h-1 bg-brand transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />

      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4">
        <div
          role="toolbar"
          aria-label="Ajustes de leitura"
          className="sticky top-0 z-40 -mx-4 mb-4 flex items-center justify-end gap-1 border-b border-line bg-background/95 px-4 py-2 backdrop-blur"
        >
          {sizes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => changeFont(s.id)}
              aria-label={s.aria}
              aria-pressed={font === s.id}
              className={`${s.cls} size-11 rounded-lg font-serif font-medium ${
                font === s.id ? "bg-brand text-on-brand" : "text-muted hover:bg-lilac"
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
            className="ml-2 h-11 rounded-lg px-3 text-sm text-muted hover:bg-lilac"
          >
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </button>
        </div>

        {resumed && (
          <p role="status" className="mb-4 rounded-lg bg-lilac px-3 py-2 text-sm text-muted">
            Voltamos ao ponto em que você parou.
          </p>
        )}

        <div className={FONT_CLASS[font]}>{children}</div>
      </div>
    </div>
  );
}
