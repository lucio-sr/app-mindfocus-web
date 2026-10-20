import { Suspense } from "react";
import { ClipboardList, Gamepad2, UserPlus, UsersRound } from "lucide-react";
import { StatCard } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Início" };

export default function PanelHomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PanelHome />
    </Suspense>
  );
}

async function PanelHome() {
  const [access, current] = await Promise.all([getAccess(), getCurrentInstitution()]);
  const supabase = await createClient();
  const id = current!.institution_id;
  const count = { count: "exact" as const, head: true };
  const [patients, sessions, members] = await Promise.all([
    supabase.from("patients").select("id", count).eq("institution_id", id),
    supabase.from("game_sessions").select("id", count).eq("institution_id", id),
    supabase.from("institution_members").select("user_id", count).eq("institution_id", id).eq("active", true),
  ]);

  return (
    <>
      <PageHeader
        title={`Olá, ${access!.full_name.split(" ")[0]}!`}
        description={current!.institution_name}
        actions={
          <LinkButton href="/painel/pacientes/novo">
            <UserPlus className="size-4" aria-hidden /> Novo paciente
          </LinkButton>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pacientes" value={patients.count ?? 0} icon={<ClipboardList className="size-5" />} />
        <StatCard label="Sessões de jogo" value={sessions.count ?? 0} icon={<Gamepad2 className="size-5" />} tone="green" />
        <StatCard label="Equipe" value={members.count ?? 0} icon={<UsersRound className="size-5" />} tone="sand" />
      </div>
    </>
  );
}
