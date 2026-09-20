import type { PersonDetail } from "./admin/people-queries";
import type { PersonRow } from "./admin/people";

/** Data fixa das pré-visualizações /dev/pessoas: assim os textos "há N dias" não mudam de um dia para o outro. */
export const DEV_NOW = new Date("2026-09-20T15:00:00Z");

const at = (daysAgo: number, hour = 14) => new Date(Date.UTC(2026, 8, 20 - daysAgo, hour)).toISOString();

const row = (
  id: string,
  name: string,
  status: PersonRow["status"],
  extra: Partial<PersonRow> = {},
): PersonRow => {
  const createdAt = extra.createdAt ?? at(30);
  return {
    id,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "")}@example.com`,
    role: "member",
    createdAt,
    onboardedAt: createdAt, // por padrão o primeiro acesso foi concluído no mesmo dia
    completedLessons: 0,
    startedLessons: 0,
    lastActivityAt: null,
    status,
    ...extra,
  };
};

/** Pessoas de exemplo para a pré-visualização (nomes fictícios). */
export const DEV_PEOPLE: PersonRow[] = [
  row("00000000-0000-4000-8000-000000000001", "Ana Souza", "in_progress", { completedLessons: 3, startedLessons: 4, lastActivityAt: at(1), createdAt: at(12) }),
  row("00000000-0000-4000-8000-000000000002", "Bia Lima", "stalled", { completedLessons: 1, startedLessons: 1, lastActivityAt: at(23), createdAt: at(40) }),
  row("00000000-0000-4000-8000-000000000003", "Caio Nunes", "completed", { completedLessons: 8, startedLessons: 8, lastActivityAt: at(5), createdAt: at(60) }),
  row("00000000-0000-4000-8000-000000000004", "Dani Rocha", "onboarding_pending", { onboardedAt: null, createdAt: at(2) }),
  row("00000000-0000-4000-8000-000000000005", "Edu Alves", "not_started", { createdAt: at(3), onboardedAt: at(3) }),
  row("00000000-0000-4000-8000-000000000006", "Edna Editora", "in_progress", { role: "editor", completedLessons: 2, startedLessons: 2, lastActivityAt: at(0) }),
  row("00000000-0000-4000-8000-000000000007", "Pastor Paulo", "completed", { role: "admin", completedLessons: 8, startedLessons: 8, lastActivityAt: at(0) }),
];

export function devPersonDetail(id: string): PersonDetail | null {
  const summary = DEV_PEOPLE.find((p) => p.id === id);
  if (!summary) return null;
  return {
    summary,
    whatsapp: id.endsWith("1") ? "5511912345678" : null,
    bibleVersion: "NTLH",
    consents: [
      { purpose: "data_processing", termVersion: "2026-09-rascunho", acceptedAt: summary.createdAt, revokedAt: null },
      { purpose: "email_reminders", termVersion: "2026-09-rascunho", acceptedAt: summary.createdAt, revokedAt: at(4) },
    ],
    history:
      summary.role === "member"
        ? []
        : [
            {
              action: "role_changed",
              createdAt: at(9),
              actorName: "Pastor Paulo",
              details: { from: "member", to: summary.role },
            },
          ],
  };
}
