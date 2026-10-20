import { createClient } from "@/lib/supabase/server";

export type Member = {
  user_id: string;
  role: "admin" | "psychologist" | "staff";
  active: boolean;
  created_at: string;
  profile: { full_name: string; email: string; cpf: string } | null;
};

// Colaboradores da instituição (o RLS só devolve se quem pede puder ver).
export async function listMembers(institutionId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("institution_members")
    .select("user_id, role, active, created_at, profile:profiles!institution_members_user_id_fkey(full_name, email, cpf)")
    .eq("institution_id", institutionId)
    .order("active", { ascending: false })
    .order("created_at");
  return (data ?? []) as unknown as Member[];
}
