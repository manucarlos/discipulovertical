import { describe, expect, it } from "vitest";
import { asLessonContent } from "./validate";
import { asLessonVideo, buildVideo, embedUrl, parseVideoUrl, watchUrl } from "./video";

describe("parseVideoUrl", () => {
  it("reconhece os formatos do YouTube", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "  https://youtu.be/dQw4w9WgXcQ  ",
    ]) {
      expect(parseVideoUrl(url), url).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    }
  });

  it("reconhece os formatos do Vimeo", () => {
    for (const url of ["https://vimeo.com/123456789", "https://www.vimeo.com/123456789", "https://player.vimeo.com/video/123456789?h=abc", "https://vimeo.com/channels/staffpicks/123456789"]) {
      expect(parseVideoUrl(url), url).toEqual({ provider: "vimeo", id: "123456789" });
    }
  });

  it("recusa outros sites, esquemas perigosos, códigos malformados e lixo", () => {
    for (const url of [
      "",
      "não é link",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://evil.example.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=curto",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ<script>",
      "https://www.youtube.com/",
      "https://vimeo.com/abc",
      "https://vimeo.com/123",
      "ftp://youtu.be/dQw4w9WgXcQ",
    ]) {
      expect(parseVideoUrl(url), url).toBeNull();
    }
  });
});

describe("embedUrl e watchUrl", () => {
  it("usa o modo de privacidade e ida e volta do editor", () => {
    expect(embedUrl({ provider: "youtube", id: "dQw4w9WgXcQ" })).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    expect(embedUrl({ provider: "vimeo", id: "123456789" })).toBe("https://player.vimeo.com/video/123456789?dnt=1");
    for (const v of [{ provider: "youtube", id: "dQw4w9WgXcQ" }, { provider: "vimeo", id: "123456789" }] as const) {
      expect(parseVideoUrl(watchUrl(v))).toEqual(v);
    }
  });
});

describe("asLessonVideo e buildVideo", () => {
  it("só aceita provedor e código válidos; corta a transcrição enorme", () => {
    expect(asLessonVideo({ provider: "youtube", id: "dQw4w9WgXcQ", transcript: "Texto" })).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ", transcript: "Texto" });
    expect(asLessonVideo({ provider: "youtube", id: "curto", transcript: "" })).toBeNull();
    expect(asLessonVideo({ provider: "vimeo", id: "dQw4w9WgXcQ", transcript: "" })).toBeNull();
    expect(asLessonVideo({ provider: "tiktok", id: "123456789", transcript: "" })).toBeNull();
    expect(asLessonVideo(null)).toBeNull();
    expect(asLessonVideo({ provider: "vimeo", id: "123456789" })?.transcript).toBe("");
    expect(asLessonVideo({ provider: "vimeo", id: "123456789", transcript: "x".repeat(40_000) })?.transcript).toHaveLength(30_000);
  });

  it("link vazio = sem vídeo; link ruim vira um vídeo sem código, que o servidor recusa", () => {
    expect(buildVideo("  ", "texto")).toBeNull();
    expect(buildVideo("https://youtu.be/dQw4w9WgXcQ", "  Fala.\r\n\r\nFim.  ")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ", transcript: "Fala.\n\nFim." });
    const bad = buildVideo("https://exemplo.org/v", "x");
    expect(bad).toEqual({ provider: "youtube", id: "", transcript: "x" });
    expect(asLessonVideo(bad)).toBeNull();
  });

  it("o conteúdo da lição guarda o vídeo válido e descarta o inválido (a validação do editor recusa antes)", () => {
    const base = { blocks: [], practice: null, reflection: null };
    expect(asLessonContent({ ...base, video: { provider: "vimeo", id: "123456789", transcript: "" } })?.video).toEqual({ provider: "vimeo", id: "123456789", transcript: "" });
    expect(asLessonContent({ ...base, video: { provider: "vimeo", id: "x", transcript: "" } })?.video).toBeUndefined();
    expect(asLessonContent(base)?.video).toBeUndefined();
  });
});
