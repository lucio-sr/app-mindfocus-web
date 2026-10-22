import { Suspense } from "react";
import { InstitutionEditForm } from "@/components/institution/institution-edit-form";
import { ReportSettingsForm } from "@/components/institution/report-settings-form";
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
  const [{ data: inst }, { data: rs }] = await Promise.all([
    supabase.from("institutions").select("*").eq("id", current!.institution_id).single(),
    supabase.from("institution_report_settings").select("*").eq("institution_id", current!.institution_id).maybeSingle(),
  ]);
  if (!inst) return null;
  const canEdit = current!.role === "admin" || access!.is_platform_admin;

  return (
    <div className="flex flex-col gap-6">
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
      <Card title="Relatório e devolutiva">
        <ReportSettingsForm
          institutionId={inst.id}
          canEdit={canEdit}
          logoPath={inst.logo_path}
          partnerPaths={rs?.partner_logo_paths ?? []}
          initial={{
            subtitle: rs?.subtitle ?? "",
            cover_text: rs?.cover_text ?? "",
            intro_text: rs?.intro_text ?? "",
            study_description: rs?.study_description ?? "",
            procedures_text: rs?.procedures_text ?? "",
            ethics_statement: rs?.ethics_statement ?? "",
            closing_notes: (rs?.closing_notes ?? []).join("\n"),
            references_url: rs?.references_url ?? "",
            location: rs?.location ?? "",
          }}
        />
      </Card>
    </div>
  );
}
