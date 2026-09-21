import type { LessonVideo } from "./types";

/**
 * Vídeo de uma lição (RF-11): só YouTube e Vimeo, sempre no modo de privacidade (youtube-nocookie e dnt=1),
 * e com um campo para a transcrição em texto (acessibilidade). Guardamos só o tipo e o código do vídeo, nunca
 * o link inteiro: assim nenhum endereço estranho entra na página.
 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

export const VIDEO_LIMITS = { transcript: 30_000 } as const;

/** Lê um link do YouTube ou do Vimeo e devolve o tipo e o código; nulo se não for um link aceito. */
export function parseVideoUrl(input: string): Pick<LessonVideo, "provider" | "id"> | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0] ?? "";
    return YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = parts[0] === "watch" ? (url.searchParams.get("v") ?? "") : ["embed", "shorts", "live", "v"].includes(parts[0] ?? "") ? (parts[1] ?? "") : "";
    return YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = host === "player.vimeo.com" ? (parts[0] === "video" ? (parts[1] ?? "") : "") : (parts.find((p) => /^\d+$/.test(p)) ?? "");
    return VIMEO_ID.test(id) ? { provider: "vimeo", id } : null;
  }
  return null;
}

/** Endereço do player em modo de privacidade. */
export function embedUrl(video: Pick<LessonVideo, "provider" | "id">): string {
  return video.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${video.id}?rel=0`
    : `https://player.vimeo.com/video/${video.id}?dnt=1`;
}

/** Link "normal" para mostrar de volta ao editor. */
export function watchUrl(video: Pick<LessonVideo, "provider" | "id">): string {
  return video.provider === "youtube" ? `https://www.youtube.com/watch?v=${video.id}` : `https://vimeo.com/${video.id}`;
}

/** Confere um vídeo vindo do banco ou do editor; nulo se os campos não fecham. */
export function asLessonVideo(value: unknown): LessonVideo | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const provider = v.provider;
  const id = v.id;
  if (typeof id !== "string") return null;
  if (!((provider === "youtube" && YOUTUBE_ID.test(id)) || (provider === "vimeo" && VIMEO_ID.test(id)))) return null;
  const transcript = typeof v.transcript === "string" ? v.transcript.slice(0, VIDEO_LIMITS.transcript) : "";
  return { provider, id, transcript };
}

/**
 * Do formulário do editor para o conteúdo: link vazio = sem vídeo. Um link que não presta vira um vídeo de código
 * vazio, que o servidor recusa com uma mensagem clara (nunca some em silêncio).
 */
export function buildVideo(url: string, transcript: string): LessonVideo | null {
  if (url.trim() === "") return null;
  const parsed = parseVideoUrl(url);
  const text = transcript.replace(/\r\n/g, "\n").trim();
  return { ...(parsed ?? { provider: "youtube" as const, id: "" }), transcript: text };
}
