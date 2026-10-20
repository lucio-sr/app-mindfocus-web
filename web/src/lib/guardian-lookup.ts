import { createClient } from "@/lib/supabase/client";

export type FoundGuardian = { full_name: string; email: string; phone: string | null; knownFor: string[] };

// Procura um responsável pelo CPF entre os responsáveis DESTA instituição (o RLS só mostra esses).
// Não consulta outras instituições, para não revelar quem é atendido em outro lugar.
export async function lookupGuardian(institutionId: string, cpfDigits: string): Promise<FoundGuardian | null> {
  const { data } = await createClient()
    .from("patient_guardians")
    .select("guardian:profiles!inner(full_name, email, phone, cpf), patient:patients(full_name)")
    .eq("institution_id", institutionId)
    .eq("guardian.cpf", cpfDigits);
  const rows = (data ?? []) as unknown as {
    guardian: { full_name: string; email: string; phone: string | null };
    patient: { full_name: string } | null;
  }[];
  if (rows.length === 0) return null;
  return {
    ...rows[0].guardian,
    knownFor: rows.map((r) => r.patient?.full_name).filter((n): n is string => Boolean(n)),
  };
}
