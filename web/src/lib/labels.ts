export const roleLabel = { admin: "Administrador(a)", psychologist: "Psicólogo(a)", staff: "Colaborador(a)" } as const;

export const statusLabel = {
  active: { label: "Ativa", tone: "green" },
  pending: { label: "Pendente", tone: "sand" },
  suspended: { label: "Suspensa", tone: "red" },
} as const;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function ageFrom(birthdate: string, today = new Date()): number {
  const [y, m, d] = birthdate.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

export const gameLabel = { gonogo: "Go/No-Go", tmt_a: "TMT A", tmt_b: "TMT B", genius: "Genius", stroop: "Stroop" } as const;

export const RELATIONSHIPS = ["Mãe", "Pai", "Avó", "Avô", "Tia", "Tio", "Madrasta", "Padrasto", "Responsável legal", "Outro"];

export const GENDERS = ["Feminino", "Masculino", "Outro", "Prefere não informar"];

export const EDUCATION = [
  "Educação infantil",
  "1º ano (EF)",
  "2º ano (EF)",
  "3º ano (EF)",
  "4º ano (EF)",
  "5º ano (EF)",
  "6º ano (EF)",
  "7º ano (EF)",
  "8º ano (EF)",
  "9º ano (EF)",
  "1º ano (EM)",
  "2º ano (EM)",
  "3º ano (EM)",
  "Não frequenta a escola",
];

// Versão do termo de consentimento registrada no cadastro (tabela consents).
export const CONSENT_TERM_VERSION = "2026-10";
