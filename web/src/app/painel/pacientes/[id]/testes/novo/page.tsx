import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AssessmentForm } from "@/components/assessments/assessment-form";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { canRegisterTests, listProfessionals } from "@/lib/assessments";
import { INSTRUMENTS, type InstrumentId } from "@/lib/instruments";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Registrar teste" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewAssessmentPage(props: PageProps<"/painel/pacientes/[id]/testes/novo">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewAssessment {...props} />
    </Suspense>
  );
}

async function NewAssessment({ params, searchParams }: PageProps<"/painel/pacientes/[id]/testes/novo">) {
  const [{ id }, { instrumento }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [access, current] = await Promise.all([getAccess(), getCurrentInstitution()]);
  if (!canRegisterTests(current!.role)) redirect(`/painel/pacientes/${id}`);

  const supabase = await createClient();
  const [{ data: patient }, professionals] = await Promise.all([
    supabase.from("patients").select("full_name").eq("id", id).eq("institution_id", current!.institution_id).maybeSingle(),
    listProfessionals(current!.institution_id),
  ]);
  if (!patient) notFound();

  const initialInstrument = INSTRUMENTS.some((i) => i.id === instrumento) ? (instrumento as InstrumentId) : undefined;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Registrar teste neuropsicológico"
        description={patient.full_name}
        back={{ href: `/painel/pacientes/${id}`, label: "Ficha do paciente" }}
      />
      <AssessmentForm
        institutionId={current!.institution_id}
        patientId={id}
        professionals={professionals}
        currentUserId={access!.user_id}
        initialInstrument={initialInstrument}
      />
    </div>
  );
}
