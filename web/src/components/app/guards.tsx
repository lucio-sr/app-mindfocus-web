import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAccess, getCurrentInstitution } from "@/lib/access";

// Barreiras de navegação. A proteção real dos dados é o RLS; aqui só evitamos telas sem sentido
// para o perfil (ex.: painel para quem não é membro de nenhuma instituição).

export async function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const access = await getAccess();
  if (!access) redirect("/entrar");
  if (!access.is_platform_admin) redirect("/inicio");
  return children;
}

export async function RequireMember({ children }: { children: ReactNode }) {
  const access = await getAccess();
  if (!access) redirect("/entrar");
  if (!(await getCurrentInstitution())) redirect("/inicio");
  return children;
}
