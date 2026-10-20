import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";

// Cliente para Server Components e Server Functions, com a sessão dos cookies.
// connection(): dados por requisição (o supabase-js usa Date.now ao validar a sessão).
export async function createClient() {
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component não grava cookies; o proxy.ts renova a sessão.
        }
      },
    },
  });
}

export type Access = {
  user_id: string;
  is_platform_admin: boolean;
  is_guardian: boolean;
  memberships: { institution_id: string; institution_name: string; role: "admin" | "psychologist" | "staff" }[];
};

// Página inicial de cada perfil.
export function homeFor(access: Access | null): string {
  if (!access) return "/entrar";
  if (access.memberships.length > 0) return "/painel";
  if (access.is_platform_admin) return "/admin";
  if (access.is_guardian) return "/responsavel";
  return "/sem-acesso";
}
