// Clientes Supabase. `adminClient` usa a service_role (ignora RLS) e só deve ser usado para o que
// exige isso: Auth admin, busca de e-mail por CPF e limite de tentativas. Gravações de negócio
// usam `userClient`, com o JWT de quem chamou, para o RLS continuar valendo.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fromPostgrestError, HttpError } from "./http.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function adminClient(): SupabaseClient {
  return createClient(URL, SERVICE_KEY, noSession);
}

export function anonClient(): SupabaseClient {
  return createClient(URL, ANON_KEY, noSession);
}

export type Membership = { institution_id: string; institution_name: string; role: "admin" | "psychologist" | "staff" };

export type Caller = {
  userId: string;
  client: SupabaseClient;
  isPlatformAdmin: boolean;
  memberships: Membership[];
};

// Valida o JWT do header Authorization e carrega os vínculos de quem chamou.
export async function requireCaller(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "unauthorized", "Faça login para continuar.");

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Sessão inválida ou expirada.");

  const client = createClient(URL, ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: access, error: accessError } = await client.rpc("current_user_access");
  if (accessError) throw fromPostgrestError(accessError);

  return {
    userId: data.user.id,
    client,
    isPlatformAdmin: access?.is_platform_admin === true,
    memberships: access?.memberships ?? [],
  };
}

// Conta uma tentativa; lança 429 se a chave passou do limite na janela.
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  const { data, error } = await adminClient().rpc("hit_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) throw fromPostgrestError(error);
  if (data !== true) {
    throw new HttpError(429, "too_many_attempts", "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
  }
}
