// Localiza ou cria a conta (Auth + profiles) de uma pessoa identificada por CPF e e-mail.
// O trigger on_auth_user_created cria o profile a partir de full_name/cpf nos metadados.

import { adminClient } from "./clients.ts";
import { isEmail, isValidCpf, onlyDigits } from "./br.ts";
import { HttpError, isAllowedOrigin } from "./http.ts";

export type Person = { full_name: string; cpf: string; email: string };

// Como a pessoa recebe acesso a uma conta nova:
//   email — convite do Auth por e-mail (precisa de SMTP configurado);
//   link  — o link de convite volta na resposta, sem e-mail (só superadmin);
//   none  — conta criada sem senha; a pessoa define a senha pelo "esqueci a senha" (CPF).
export type Delivery = "email" | "link" | "none";

export type Account = { userId: string; created: boolean; actionLink?: string };

export function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? "https://app.mindfocus.com.br").replace(/\/+$/, "");
}

// Aceita só redirecionamentos para o site ou para as origens permitidas do frontend (ALLOWED_ORIGINS).
export function safeRedirect(value: unknown, defaultPath: string): string {
  const fallback = siteUrl() + defaultPath;
  if (typeof value !== "string" || value === "") return fallback;
  try {
    const url = new URL(value);
    return url.origin === new URL(siteUrl()).origin || isAllowedOrigin(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function parsePerson(value: unknown, label: string): Person {
  const p = (value ?? {}) as Record<string, unknown>;
  const full_name = typeof p.full_name === "string" ? p.full_name.trim().replace(/\s+/g, " ") : "";
  const cpf = onlyDigits(p.cpf);
  const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
  if (!full_name) throw new HttpError(422, "invalid_data", `Informe o nome completo (${label}).`);
  if (!isValidCpf(cpf)) throw new HttpError(422, "invalid_data", `CPF inválido (${label}).`);
  if (!isEmail(email)) throw new HttpError(422, "invalid_data", `E-mail inválido (${label}).`);
  return { full_name, cpf, email };
}

export function parseDelivery(value: unknown, isPlatformAdmin: boolean, fallback: Delivery): Delivery {
  if (value === undefined || value === null) return fallback;
  if (value !== "email" && value !== "link" && value !== "none") {
    throw new HttpError(422, "invalid_data", "delivery deve ser 'email', 'link' ou 'none'.");
  }
  if (value === "link" && !isPlatformAdmin) {
    throw new HttpError(403, "forbidden", "Só o superadmin pode receber o link de convite.");
  }
  return value;
}

export async function findOrCreateAccount(person: Person, delivery: Delivery, redirectTo: string): Promise<Account> {
  const admin = adminClient();

  const { data: byCpf, error: cpfError } = await admin
    .from("profiles").select("id, email").eq("cpf", person.cpf).maybeSingle();
  if (cpfError) throw new HttpError(500, "database_error", "Erro ao consultar cadastro.");
  if (byCpf) {
    if (String(byCpf.email).toLowerCase() !== person.email) {
      throw new HttpError(409, "cpf_email_mismatch", "Este CPF já está cadastrado com outro e-mail.");
    }
    return { userId: byCpf.id, created: false };
  }

  const { data: byEmail, error: emailError } = await admin
    .from("profiles").select("id").eq("email", person.email).maybeSingle();
  if (emailError) throw new HttpError(500, "database_error", "Erro ao consultar cadastro.");
  if (byEmail) throw new HttpError(409, "email_in_use", "Este e-mail já está cadastrado com outro CPF.");

  const metadata = { full_name: person.full_name, cpf: person.cpf };

  if (delivery === "email") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(person.email, { data: metadata, redirectTo });
    if (error || !data.user) throw authError(error);
    return { userId: data.user.id, created: true };
  }

  if (delivery === "link") {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: person.email,
      options: { data: metadata, redirectTo },
    });
    if (error || !data.user) throw authError(error);
    return { userId: data.user.id, created: true, actionLink: data.properties.action_link };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: person.email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw authError(error);
  return { userId: data.user.id, created: true };
}

// Desfaz uma conta recém-criada quando o resto do cadastro falha.
export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) console.error(`falha ao desfazer conta ${userId}:`, error.message);
}

function authError(error: { message: string; status?: number } | null): HttpError {
  console.error("auth admin:", error?.message);
  if (error?.status === 422 || /already.*registered|exists/i.test(error?.message ?? "")) {
    return new HttpError(409, "conflict", "Já existe uma conta com este e-mail.");
  }
  if (/email/i.test(error?.message ?? "") && /send|sending/i.test(error?.message ?? "")) {
    return new HttpError(502, "email_failed", "Não foi possível enviar o e-mail de convite.");
  }
  return new HttpError(500, "auth_error", "Erro ao criar a conta.");
}

// Dados pessoais opcionais gravados no profile de uma conta recém-criada.
const PROFILE_FIELDS = [
  "phone",
  "birthdate",
  "gender",
  "cep",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "uf",
] as const;

export function profileExtras(guardian: Record<string, unknown>): Record<string, string> {
  const extras: Record<string, string> = {};
  for (const field of PROFILE_FIELDS) {
    const value = guardian[field];
    if (typeof value === "string" && value.trim()) extras[field] = value.trim();
  }
  if (extras.cep) extras.cep = onlyDigits(extras.cep);
  if (extras.uf) extras.uf = extras.uf.toUpperCase();
  return extras;
}
