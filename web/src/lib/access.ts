import { cookies } from "next/headers";
import { cache } from "react";
import { createClient, type Access } from "@/lib/supabase/server";

export const INSTITUTION_COOKIE = "mf_institution";

export type CurrentUser = Access & { full_name: string; email: string };

// Usuário logado + vínculos (uma consulta por requisição).
export const getAccess = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;

  const [{ data: access }, { data: profile }] = await Promise.all([
    supabase.rpc("current_user_access"),
    supabase.from("profiles").select("full_name, email").eq("id", claims.claims.sub).single(),
  ]);
  if (!access) return null;
  return { ...(access as unknown as Access), full_name: profile?.full_name ?? "", email: profile?.email ?? "" };
});

// Instituição em uso no painel: a escolhida no seletor (cookie), se o usuário ainda for membro;
// senão, a primeira da lista.
export const getCurrentInstitution = cache(async () => {
  const access = await getAccess();
  if (!access || access.memberships.length === 0) return null;
  const chosen = (await cookies()).get(INSTITUTION_COOKIE)?.value;
  return access.memberships.find((m) => m.institution_id === chosen) ?? access.memberships[0];
});
