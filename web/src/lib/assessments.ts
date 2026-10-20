import { createClient } from "@/lib/supabase/server";

// Quem pode constar como "aplicado por": admins e psicólogos ativos da instituição.
export async function listProfessionals(institutionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("institution_members")
    .select("user_id, profile:profiles!institution_members_user_id_fkey(full_name)")
    .eq("institution_id", institutionId)
    .eq("active", true)
    .in("role", ["admin", "psychologist"]);
  return ((data ?? []) as unknown as { user_id: string; profile: { full_name: string } | null }[])
    .map((m) => ({ id: m.user_id, name: m.profile?.full_name ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export const canRegisterTests = (role: string) => role === "admin" || role === "psychologist";
