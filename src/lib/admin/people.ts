export type UserRole = "member" | "caregiver" | "editor" | "admin";
export type MemberStatus = "onboarding_pending" | "not_started" | "in_progress" | "stalled" | "completed";

export const ROLES: UserRole[] = ["member", "caregiver", "editor", "admin"];
export const STATUSES: MemberStatus[] = ["onboarding_pending", "not_started", "in_progress", "stalled", "completed"];

export const ROLE_LABEL: Record<UserRole, string> = {
  member: "Membro",
  caregiver: "Cuidador",
  editor: "Editor",
  admin: "Administrador",
};

export const ROLE_HINT: Record<UserRole, string> = {
  member: "Faz a trilha e vê só os próprios dados.",
  caregiver: "Acompanha os membros atribuídos a ele: vê o progresso, os alertas e as reflexões deles e registra notas de cuidado (com o recurso Cuidadores ligado).",
  editor: "Cria e edita lições em rascunho e envia para revisão. Não publica e não vê dados pessoais.",
  admin: "Acesso total: publica, vê todas as pessoas e promove perfis.",
};

export const STATUS_LABEL: Record<MemberStatus, string> = {
  onboarding_pending: "Primeiro acesso pendente",
  not_started: "Ainda não começou",
  in_progress: "Em andamento",
  stalled: "Parado",
  completed: "Concluiu a trilha",
};

export const PAGE_SIZE = 25;

export interface PeopleFilters {
  search: string;
  role: UserRole | null;
  status: MemberStatus | null;
  /** Começa em 1. */
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lê os filtros da URL (?q=&papel=&situacao=&pagina=) ignorando qualquer valor que não seja válido. */
export function parsePeopleFilters(params: Params): PeopleFilters {
  const search = (first(params.q) ?? "").trim().slice(0, 100);
  const role = ROLES.find((r) => r === first(params.papel)) ?? null;
  const status = STATUSES.find((s) => s === first(params.situacao)) ?? null;
  const pageNumber = Number(first(params.pagina));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 10_000 ? pageNumber : 1;
  return { search, role, status, page };
}

/** Monta a query string de uma lista filtrada (para os links de página). Omite o que é padrão. */
export function peopleQueryString(filters: PeopleFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.role) params.set("papel", filters.role);
  if (filters.status) params.set("situacao", filters.status);
  if (page > 1) params.set("pagina", String(page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

const TIME_ZONE = "America/Sao_Paulo";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d); // yyyy-mm-dd
const dayNumber = (d: Date) => Math.floor(Date.parse(`${dayKey(d)}T00:00:00Z`) / 86_400_000);

/** "hoje", "ontem", "há 5 dias", "há 3 meses"; nulo vira "nenhuma atividade". Dias contados no fuso de Brasília. */
export function describeActivity(when: string | Date | null, now: Date): string {
  if (when === null) return "nenhuma atividade";
  const days = dayNumber(now) - dayNumber(new Date(when));
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 60) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months < 24 ? `há ${months} meses` : `há ${Math.floor(months / 12)} anos`;
}

export const CONSENT_LABEL: Record<string, string> = {
  data_processing: "Tratamento dos dados",
  email_reminders: "Lembretes por e-mail",
  whatsapp_reminders: "Lembretes por WhatsApp",
};

export const AUDIT_LABEL: Record<string, string> = {
  role_changed: "Perfil alterado",
  initial_admin_assigned: "Primeiro administrador definido",
  care_assigned: "Cuidador atribuído",
  care_unassigned: "Cuidador removido",
  care_alert_updated: "Alerta de cuidado atualizado",
};

/** "5511912345678" -> "+55 (11) 91234-5678". Devolve o texto original se não reconhecer o formato. */
export function formatWhatsapp(digits: string | null): string | null {
  if (!digits) return null;
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : digits;
}

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  onboardedAt: string | null;
  completedLessons: number;
  startedLessons: number;
  lastActivityAt: string | null;
  status: MemberStatus;
}
