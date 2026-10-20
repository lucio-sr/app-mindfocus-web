import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Sessão em cookies, lida também pelo servidor (proxy.ts e Server Components).
// detectSessionInUrl desligado: os links de convite e de recuperação são tratados à mão em
// /definir-senha e /redefinir-senha (o cliente PKCE recusaria os tokens que chegam no #hash).
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    auth: { detectSessionInUrl: false },
  });
}

export type FunctionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; message: string };

// Chama uma Edge Function direto do navegador (o limite de tentativas por IP vê o IP real).
export async function callFunction<T>(
  name: string,
  body: unknown,
  accessToken?: string,
): Promise<FunctionResult<T>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: json as T };
    return {
      ok: false,
      status: res.status,
      error: json.error ?? "unknown",
      message: json.message ?? "Não foi possível concluir. Tente de novo.",
    };
  } catch {
    return { ok: false, status: 0, error: "network", message: "Sem conexão com o servidor. Verifique sua internet." };
  }
}

// Mesma chamada, com o token da sessão do usuário (funções que exigem login).
export async function callFunctionAsUser<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, status: 401, error: "unauthorized", message: "Sua sessão expirou. Entre de novo." };
  return callFunction<T>(name, body, token);
}
