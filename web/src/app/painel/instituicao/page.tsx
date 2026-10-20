import { Suspense } from "react";
import { InstitutionEditForm } from "@/components/institution/institution-edit-form";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { formatCep, formatDocument, formatPhone } from "@/lib/br";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Instituição" };

export default function InstitutionPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Instituição" description="Dados cadastrais. CNPJ/CPF e situação são alterados pela equipe MindFocus." />
      <Suspense fallback={<PageLoading />}>
        <InstitutionData />
      </Suspense>
    </div>
  );
}

async function InstitutionData() {
  const [access, current] = await Promise.all([getAccess(), getCurrentInstitution()]);
  const supabase = await createClient();
  const { data: inst } = await supabase.from("institutions").select("*").eq("id", current!.institution_id).single();
  if (!inst) return null;
  const canEdit = current!.role === "admin" || access!.is_platform_admin;

  return (
    <Card title={`${inst.document_type.toUpperCase()} ${formatDocument(inst.document)}`}>
      <InstitutionEditForm
        id={inst.id}
        canEdit={canEdit}
        initial={{
          name: inst.name,
          legal_name: inst.legal_name ?? "",
          email: inst.email ?? "",
          phone: inst.phone ? formatPhone(inst.phone) : "",
          cep: inst.cep ? formatCep(inst.cep) : "",
          street: inst.street ?? "",
          number: inst.number ?? "",
          complement: inst.complement ?? "",
          district: inst.district ?? "",
          city: inst.city ?? "",
          uf: inst.uf ?? "",
        }}
      />
    </Card>
  );
}
