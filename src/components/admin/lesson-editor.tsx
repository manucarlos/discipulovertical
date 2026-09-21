"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { allowedTransitions, STATUS_LABEL, type LessonStatus, type StaffRole } from "@/lib/admin/status";
import type { LessonForEditing } from "@/lib/admin/queries";
import {
  buildPractice,
  buildReflection,
  itemsToLines,
  parseTags,
} from "@/lib/content/editor-form";
import { findPlaceholders } from "@/lib/content/placeholders";
import { blocksToDoc, docToBlocks, type PMNode } from "@/lib/content/tiptap";
import { buildVideo, watchUrl } from "@/lib/content/video";
import { BodyEditor } from "./body-editor";

export interface EditorActions {
  save: (
    expectedVersion: string | null,
    input: unknown,
  ) => Promise<{ ok: true; versionId: string; hasPlaceholders: boolean } | { ok: false; error: string; conflict: boolean }>;
  changeStatus: (to: LessonStatus) => Promise<{ ok: true } | { ok: false; error: string }>;
  restore: (versionId: string, expectedVersion: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const LETTERS = ["A", "B", "C", "D"] as const;

interface QuizForm {
  prompt: string;
  options: Record<(typeof LETTERS)[number], string>;
  correct: string;
  explanation: string;
}

interface FormState {
  title: string;
  objective: string;
  keyVerse: string;
  minutes: string;
  tagsText: string;
  required: boolean;
  sensitive: boolean;
  doc: PMNode;
  practiceTitle: string;
  practiceItems: string;
  reflection: string;
  videoUrl: string;
  videoTranscript: string;
  quiz: QuizForm[];
  pastoralReviewNote: string;
  videoSuggestion: string;
  draftNotice: string;
  buttonSuggestion: string;
  versionNote: string;
}

function initialForm(lesson: LessonForEditing): FormState {
  return {
    title: lesson.title,
    objective: lesson.objective,
    keyVerse: lesson.keyVerse,
    minutes: lesson.estimatedMinutes === null ? "" : String(lesson.estimatedMinutes),
    tagsText: lesson.tags.join(", "),
    required: lesson.required,
    sensitive: lesson.sensitive,
    doc: blocksToDoc(lesson.content.blocks),
    practiceTitle: lesson.content.practice?.title ?? "Prática da semana",
    practiceItems: itemsToLines(lesson.content.practice?.items ?? []),
    reflection: lesson.content.reflection ?? "",
    videoUrl: lesson.content.video ? watchUrl(lesson.content.video) : "",
    videoTranscript: lesson.content.video?.transcript ?? "",
    quiz: lesson.quiz.map((q) => ({
      prompt: q.prompt,
      options: { A: q.options.A ?? "", B: q.options.B ?? "", C: q.options.C ?? "", D: q.options.D ?? "" },
      correct: q.correct,
      explanation: q.explanation,
    })),
    pastoralReviewNote: lesson.notes.pastoralReviewNote,
    videoSuggestion: lesson.notes.videoSuggestion,
    draftNotice: lesson.notes.draftNotice,
    buttonSuggestion: lesson.notes.buttonSuggestion,
    versionNote: "",
  };
}

/** Monta o que é enviado ao servidor (que revalida tudo). */
function toPayload(f: FormState) {
  return {
    title: f.title,
    objective: f.objective,
    keyVerse: f.keyVerse,
    estimatedMinutes: f.minutes.trim() === "" ? null : Number(f.minutes),
    tags: parseTags(f.tagsText),
    required: f.required,
    sensitive: f.sensitive,
    content: {
      blocks: docToBlocks(f.doc),
      practice: buildPractice(f.practiceTitle, f.practiceItems),
      reflection: buildReflection(f.reflection),
      video: buildVideo(f.videoUrl, f.videoTranscript),
    },
    notes: {
      pastoralReviewNote: f.pastoralReviewNote,
      videoSuggestion: f.videoSuggestion,
      draftNotice: f.draftNotice,
      buttonSuggestion: f.buttonSuggestion,
    },
    quiz: f.quiz.map((q) => ({
      prompt: q.prompt,
      options: Object.fromEntries(LETTERS.map((l) => [l, q.options[l]]).filter(([, text]) => text.trim() !== "")),
      correct: q.correct,
      explanation: q.explanation,
    })),
    note: f.versionNote,
  };
}

const snapshotOf = (f: FormState) => JSON.stringify({ ...toPayload(f), note: "" });

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand disabled:bg-lilac";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="font-serif text-xl">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<LessonStatus, string> = {
  draft: "bg-lilac text-foreground",
  in_review: "bg-amber-100 text-amber-900",
  published: "bg-emerald-100 text-emerald-900",
  archived: "bg-zinc-200 text-zinc-700",
};

export function StatusBadge({ status }: { status: LessonStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
  );
}

export function LessonEditor({
  lesson,
  role,
  actions,
  previewHref,
}: {
  lesson: LessonForEditing;
  role: StaffRole;
  actions: EditorActions;
  previewHref: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialForm(lesson));
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf(initialForm(lesson)));
  const [expected, setExpected] = useState<string | null>(lesson.currentVersionId);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  const readOnly = role === "editor" && (lesson.status === "published" || lesson.status === "archived");
  const snapshot = useMemo(() => snapshotOf(form), [form]);
  const dirty = snapshot !== savedSnapshot;
  const payload = useMemo(() => toPayload(form), [form]);

  const pending = useMemo(
    () =>
      findPlaceholders(payload.content, {
        pastoralReviewNote: form.pastoralReviewNote,
        videoSuggestion: form.videoSuggestion,
        draftNotice: form.draftNotice,
        buttonSuggestion: form.buttonSuggestion,
      }),
    [payload.content, form.pastoralReviewNote, form.videoSuggestion, form.draftNotice, form.buttonSuggestion],
  );

  // Avisa antes de sair da página com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (saving || !dirty || readOnly) return;
    setSaving(true);
    setMessage(null);
    const submitted = snapshot;
    const result = await actions.save(expected, payload);
    setSaving(false);
    if (result.ok) {
      setExpected(result.versionId);
      setSavedSnapshot(submitted);
      patch({ versionNote: "" });
      setMessage({ kind: "ok", text: `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` });
      router.refresh();
    } else {
      setMessage({ kind: "error", text: result.error });
    }
  };

  // Ctrl+S / Cmd+S salva. O ref evita reinscrever o atalho a cada tecla digitada.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeStatus = async (to: LessonStatus, label: string, warning?: string) => {
    if (busy || dirty) return;
    const text = warning ? `${label}?\n\n${warning}` : `${label}?`;
    if (!window.confirm(text)) return;
    setBusy(true);
    setMessage(null);
    const result = await actions.changeStatus(to);
    setBusy(false);
    if (result.ok) {
      setMessage({ kind: "ok", text: "Status atualizado." });
      router.refresh();
    } else {
      setMessage({ kind: "error", text: result.error });
    }
  };

  const restore = async (versionId: string, when: string) => {
    if (busy || dirty) return;
    if (!window.confirm(`Restaurar a versão de ${when}? Ela vira a versão atual; as demais continuam no histórico.`)) return;
    setBusy(true);
    const result = await actions.restore(versionId, expected);
    setBusy(false);
    if (result.ok) window.location.reload();
    else setMessage({ kind: "error", text: result.error });
  };

  const transitions = allowedTransitions(role, lesson.status, lesson.hasPlaceholders);

  return (
    <div>
      {/* O título da lição é um campo de formulário; este título (só para leitores de tela) diz onde a pessoa está. */}
      <h1 className="sr-only">Editar lição: {form.title || "sem título"}</h1>
      <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-line bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{form.title || "Sem título"}</p>
            <p className="text-xs text-muted">
              {lesson.cycleTitle} · <StatusBadge status={lesson.status} />
              {dirty && <span className="ml-2 font-medium text-amber-700">Alterações não salvas</span>}
            </p>
          </div>
          {previewHref && (
            <Link href={previewHref} target="_blank" rel="noopener noreferrer" className="text-sm underline">
              Ver como o membro vê
            </Link>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`rounded-xl px-4 py-3 text-sm ${
              message.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"
            }`}
          >
            {message.text}
          </p>
        )}

        {readOnly && (
          <p role="status" className="rounded-xl bg-lilac px-4 py-3 text-sm text-muted">
            Esta lição está {STATUS_LABEL[lesson.status].toLowerCase()}. Só o administrador pode alterá-la.
          </p>
        )}

        {/* Status e pendências */}
        <Section title="Situação da lição">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={lesson.status} />
            {transitions.map((t) => (
              <button
                key={t.to}
                type="button"
                onClick={() => changeStatus(t.to, t.label, t.warning)}
                disabled={busy || dirty || Boolean(t.blockedReason)}
                title={t.blockedReason ?? (dirty ? "Salve as alterações antes de mudar o status." : undefined)}
                className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  t.primary ? "bg-brand text-on-brand hover:bg-brand-strong" : "border border-line hover:bg-lilac"
                }`}
              >
                {t.label}
              </button>
            ))}
            {transitions.length === 0 && <span className="text-sm text-muted">Nenhuma ação disponível para o seu perfil.</span>}
          </div>
          {dirty && transitions.length > 0 && (
            <p className="text-sm text-muted">Salve as alterações antes de mudar o status.</p>
          )}
          {transitions.find((t) => t.blockedReason) && (
            <p className="text-sm text-amber-800">{transitions.find((t) => t.blockedReason)?.blockedReason}</p>
          )}

          <div>
            <h3 className="text-sm font-medium">
              Pendências <span className="text-muted">({pending.length})</span>
            </h3>
            {pending.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Nenhum marcador [PREENCHER]. A lição pode ser publicada.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {pending.map((p, i) => (
                  <li key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-950">
                    <span className="font-medium">{p.where}:</span> {p.description || "informação a preencher"}
                  </li>
                ))}
              </ul>
            )}
            {dirty && pending.length !== (lesson.hasPlaceholders ? 1 : 0) && (
              <p className="mt-2 text-xs text-muted">A lista acompanha o que você digitou; o bloqueio de publicação só muda ao salvar.</p>
            )}
          </div>
        </Section>

        <fieldset disabled={readOnly} className="min-w-0 space-y-6 border-0 p-0">
          <Section title="Informações">
            <label className="block text-sm font-medium">
              Título
              <input className={inputClass} value={form.title} onChange={(e) => patch({ title: e.target.value })} maxLength={200} />
            </label>
            <label className="block text-sm font-medium">
              Objetivo <span className="font-normal text-muted">(uma frase sobre o que a pessoa vai aprender)</span>
              <textarea className={inputClass} rows={2} value={form.objective} onChange={(e) => patch({ objective: e.target.value })} maxLength={1000} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Versículo-chave
                <input
                  className={inputClass}
                  value={form.keyVerse}
                  onChange={(e) => patch({ keyVerse: e.target.value })}
                  placeholder="João 1.12"
                />
                <span className="mt-1 block text-xs font-normal text-muted">Só a referência. O texto bíblico nunca é colado na lição.</span>
              </label>
              <label className="block text-sm font-medium">
                Tempo estimado (minutos)
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={120}
                  value={form.minutes}
                  onChange={(e) => patch({ minutes: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Etiquetas <span className="font-normal text-muted">(separadas por vírgula)</span>
              <input className={inputClass} value={form.tagsText} onChange={(e) => patch({ tagsText: e.target.value })} placeholder="Fundamentos, Ciclo 1, visão" />
            </label>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-brand" checked={form.required} onChange={(e) => patch({ required: e.target.checked })} />
                Lição obrigatória para concluir o ciclo
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-brand" checked={form.sensitive} onChange={(e) => patch({ sensitive: e.target.checked })} />
                Tema sensível
              </label>
            </div>
          </Section>

          <Section
            title="Texto da lição"
            hint="Use Título para as seções. Quando faltar uma informação da igreja, escreva [PREENCHER: o que falta] em negrito: a lição fica bloqueada para publicação até isso ser resolvido."
          >
            <BodyEditor initialDoc={form.doc} onChange={(doc) => patch({ doc })} readOnly={readOnly} />
          </Section>

          <Section
            title="Vídeo (opcional)"
            hint="Cole o link de um vídeo do YouTube ou do Vimeo. Ele aparece no começo da lição, em modo de privacidade, quando o recurso “Vídeo nas lições” está ligado em Configurações. Escreva também a transcrição, para quem não pode ouvir."
          >
            <label className="block text-sm font-medium">
              Link do vídeo
              <input
                className={inputClass}
                value={form.videoUrl}
                onChange={(e) => patch({ videoUrl: e.target.value })}
                inputMode="url"
                placeholder="https://youtu.be/…"
              />
            </label>
            <label className="block text-sm font-medium">
              Transcrição em texto <span className="font-normal text-muted">(uma linha em branco separa parágrafos)</span>
              <textarea className={inputClass} rows={5} value={form.videoTranscript} onChange={(e) => patch({ videoTranscript: e.target.value })} />
            </label>
          </Section>

          <Section title="Prática e reflexão">
            <label className="block text-sm font-medium">
              Título da prática
              <input className={inputClass} value={form.practiceTitle} onChange={(e) => patch({ practiceTitle: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Itens da prática <span className="font-normal text-muted">(um por linha; vazio = sem prática)</span>
              <textarea className={inputClass} rows={4} value={form.practiceItems} onChange={(e) => patch({ practiceItems: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Pergunta de reflexão <span className="font-normal text-muted">(opcional)</span>
              <textarea className={inputClass} rows={3} value={form.reflection} onChange={(e) => patch({ reflection: e.target.value })} />
            </label>
          </Section>

          <Section title="Quiz" hint="Perguntas de múltipla escolha, com explicação. Os membros só veem o quiz quando o recurso “Quiz das lições” é ligado em Configurações; até lá as perguntas ficam guardadas.">
            {form.quiz.map((q, qi) => (
              <div key={qi} className="space-y-3 rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">Pergunta {qi + 1}</p>
                  <button
                    type="button"
                    onClick={() => patch({ quiz: form.quiz.filter((_, i) => i !== qi) })}
                    className="text-sm text-red-800 underline"
                  >
                    Remover
                  </button>
                </div>
                <label className="block text-sm font-medium">
                  Enunciado
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={q.prompt}
                    onChange={(e) => patch({ quiz: form.quiz.map((x, i) => (i === qi ? { ...x, prompt: e.target.value } : x)) })}
                  />
                </label>
                <fieldset>
                  <legend className="text-sm font-medium">Alternativas (marque a correta)</legend>
                  <div className="mt-1 space-y-2">
                    {LETTERS.map((letter) => (
                      <div key={letter} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${qi}`}
                          aria-label={`Alternativa ${letter} é a correta`}
                          className="size-4 accent-brand"
                          checked={q.correct === letter}
                          onChange={() => patch({ quiz: form.quiz.map((x, i) => (i === qi ? { ...x, correct: letter } : x)) })}
                        />
                        <span className="w-5 font-medium">{letter}</span>
                        <input
                          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand"
                          value={q.options[letter]}
                          aria-label={`Texto da alternativa ${letter}`}
                          onChange={(e) =>
                            patch({
                              quiz: form.quiz.map((x, i) => (i === qi ? { ...x, options: { ...x.options, [letter]: e.target.value } } : x)),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-medium">
                  Explicação da resposta
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={q.explanation}
                    onChange={(e) => patch({ quiz: form.quiz.map((x, i) => (i === qi ? { ...x, explanation: e.target.value } : x)) })}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patch({
                  quiz: [...form.quiz, { prompt: "", options: { A: "", B: "", C: "", D: "" }, correct: "", explanation: "" }],
                })
              }
              disabled={form.quiz.length >= 10}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-lilac disabled:opacity-50"
            >
              + Adicionar pergunta
            </button>
          </Section>

          <Section title="Notas da equipe" hint="Material de trabalho: o membro nunca vê estes campos.">
            <label className="block text-sm font-medium">
              Nota para revisão pastoral
              <textarea className={inputClass} rows={3} value={form.pastoralReviewNote} onChange={(e) => patch({ pastoralReviewNote: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Sugestão de vídeo
              <textarea className={inputClass} rows={2} value={form.videoSuggestion} onChange={(e) => patch({ videoSuggestion: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Botão sugerido
              <textarea className={inputClass} rows={2} value={form.buttonSuggestion} onChange={(e) => patch({ buttonSuggestion: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Aviso de rascunho
              <textarea className={inputClass} rows={2} value={form.draftNotice} onChange={(e) => patch({ draftNotice: e.target.value })} />
            </label>
          </Section>

          <Section title="Salvar">
            <label className="block text-sm font-medium">
              Comentário sobre esta versão <span className="font-normal text-muted">(opcional, aparece no histórico)</span>
              <input className={inputClass} value={form.versionNote} onChange={(e) => patch({ versionNote: e.target.value })} maxLength={200} placeholder="Ex.: ajustei o tom da abertura" />
            </label>
          </Section>
        </fieldset>

        <Section title="Histórico de versões" hint="Cada vez que você salva, uma versão nova é guardada. Restaurar cria uma versão nova com o texto antigo.">
          <ol className="space-y-2">
            {lesson.versions.map((v, i) => {
              const when = dateTime.format(new Date(v.createdAt));
              return (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{when}</span>
                    {i === 0 && <span className="ml-2 rounded-full bg-lilac px-2 py-0.5 text-xs">atual</span>}
                    <span className="block text-muted">
                      {v.authorName ?? "Equipe"}
                      {v.note ? ` · ${v.note}` : ""}
                    </span>
                  </span>
                  {i > 0 && !readOnly && (
                    <button
                      type="button"
                      onClick={() => restore(v.id, when)}
                      disabled={busy || dirty}
                      title={dirty ? "Salve as alterações antes de restaurar." : undefined}
                      className="rounded-lg border border-line px-3 py-1.5 hover:bg-lilac disabled:opacity-50"
                    >
                      Restaurar
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>
      </div>
    </div>
  );
}
