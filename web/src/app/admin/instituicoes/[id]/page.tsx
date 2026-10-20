import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InstitutionStatus } from "@/components/admin/institution-status";
import { InviteMemberForm } from "@/components/team/invite-member-form";
import { MemberList } from "@/components/team/member-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess } from "@/lib/access";
import { formatCep, formatDocument, formatPhone } from "@/lib/br";
import { formatDate, statusLabel } from "@/lib/labels";
import { listMembers } from "@/lib/team";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Instituição" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AdminInstitutionPage({ params }: PageProps<"/admin/instituicoes/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <InstitutionDetail params={params} />
    </Suspense>
  );
}

async function InstitutionDetail({ params }: Pick<PageProps<"/admin/instituicoes/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: inst }, members, access] = await Promise.all([
    supabase.from("institutions").select("*").eq("id", id).maybeSingle(),
    listMembers(id),
    getAccess(),
  ]);
  if (!inst) notFound();

  const address = [
    [inst.street, inst.number].filter(Boolean).join(", "),
    inst.complement,
    inst.district,
    [inst.city, inst.uf].filter(Boolean).join(" – "),
    inst.cep && `CEP ${formatCep(inst.cep)}`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={inst.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={statusLabel[inst.status].tone}>{statusLabel[inst.status].label}</Badge>
            <span>
              {inst.document_type.toUpperCase()} {formatDocument(inst.document)} · cadastrada em {formatDate(inst.created_at)}
            </span>
          </span>
        }
        back={{ href: "/admin", label: "Instituições" }}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card title={`Equipe (${members.filter((m) => m.active).length})`}>
            <MemberList institutionId={id} members={members} canManage currentUserId={access!.user_id} />
          </Card>
          <Card title="Incluir colaborador">
            <InviteMemberForm institutionId={id} isPlatformAdmin />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Dados">
            <dl className="space-y-3 text-sm">
              <Info label="Razão social" value={inst.legal_name} />
              <Info label="E-mail" value={inst.email} />
              <Info label="Telefone" value={inst.phone && formatPhone(inst.phone)} />
              <Info label="Endereço" value={address.length ? address.join(" · ") : null} />
            </dl>
          </Card>
          <Card title="Situação">
            <InstitutionStatus id={id} status={inst.status} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-ink/55">{label}</dt>
      <dd className="mt-0.5">{value || "—"}</dd>
    </div>
  );
}
