import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GuardianManager, type LinkedGuardian } from "@/components/patients/guardian-manager";
import { PatientEditForm } from "@/components/patients/patient-edit-form";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Editar paciente" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditPatientPage({ params }: PageProps<"/painel/pacientes/[id]/editar">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditPatient params={params} />
    </Suspense>
  );
}

type GuardianRow = {
  relationship: string;
  guardian: { id: string; full_name: string; email: string; phone: string | null; cpf: string } | null;
};

async function EditPatient({ params }: Pick<PageProps<"/painel/pacientes/[id]/editar">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [access, current] = await Promise.all([getAccess(), getCurrentInstitution()]);
  const supabase = await createClient();
  const [{ data: patient }, { data: links }] = await Promise.all([
    supabase
      .from("patients")
      .select(
        "id, full_name, birthdate, cpf, gender, education, public_school, uf, siblings, school_failure_times, school_dropout_times, medications, adhd_diagnosis, autism_diagnosis, notes",
      )
      .eq("id", id)
      .eq("institution_id", current!.institution_id)
      .maybeSingle(),
    supabase
      .from("patient_guardians")
      .select("relationship, guardian:profiles(id, full_name, email, phone, cpf)")
      .eq("patient_id", id)
      .order("created_at"),
  ]);
  if (!patient) notFound();

  const guardians: LinkedGuardian[] = ((links ?? []) as unknown as GuardianRow[])
    .filter((l) => l.guardian)
    .map((l) => ({
      guardian_id: l.guardian!.id,
      relationship: l.relationship,
      full_name: l.guardian!.full_name,
      email: l.guardian!.email,
      phone: l.guardian!.phone,
      cpf: l.guardian!.cpf,
    }));

  return (
    <>
      <PageHeader title={`Editar ${patient.full_name}`} back={{ href: `/painel/pacientes/${id}`, label: "Ficha do paciente" }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PatientEditForm patient={patient} />
        <div>
          <Card title="Responsáveis">
            <GuardianManager
              institutionId={current!.institution_id}
              patientId={id}
              patientFirstName={patient.full_name.split(" ")[0]}
              guardians={guardians}
              isPlatformAdmin={access!.is_platform_admin}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
