import { Suspense } from "react";
import { InviteMemberForm } from "@/components/team/invite-member-form";
import { MemberList } from "@/components/team/member-list";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { listMembers } from "@/lib/team";

export const metadata = { title: "Equipe" };

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Equipe" description="Todos os colaboradores veem todos os pacientes da instituição." />
      <Suspense fallback={<PageLoading />}>
        <Team />
      </Suspense>
    </>
  );
}

async function Team() {
  const [access, current] = await Promise.all([getAccess(), getCurrentInstitution()]);
  const id = current!.institution_id;
  const members = await listMembers(id);
  const canManage = current!.role === "admin" || access!.is_platform_admin;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title={`Colaboradores (${members.filter((m) => m.active).length})`}>
        <MemberList institutionId={id} members={members} canManage={canManage} currentUserId={access!.user_id} />
      </Card>
      {canManage ? (
        <Card title="Incluir colaborador">
          <InviteMemberForm institutionId={id} isPlatformAdmin={access!.is_platform_admin} />
        </Card>
      ) : (
        <p className="text-sm text-ink/60">Só administradores da instituição incluem ou desligam colaboradores.</p>
      )}
    </div>
  );
}
