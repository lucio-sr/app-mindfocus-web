import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AssessmentForm } from "@/components/assessments/assessment-form";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { getAssessment } from "@/lib/assessment-query";
import { canRegisterTests, listProfessionals } from "@/lib/assessments";
import { instrumentLabel } from "@/lib/instruments";

export const metadata = { title: "Editar teste" };

export default function EditAssessmentPage(props: PageProps<"/painel/pacientes/[id]/testes/[testId]/editar">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditAssessment {...props} />
    </Suspense>
  );
}

async function EditAssessment({ params }: PageProps<"/painel/pacientes/[id]/testes/[testId]/editar">) {
  const { id, testId } = await params;
  const [access, current] = await Promise.all([getAccess(), getCurrentInstitution()]);
  if (!canRegisterTests(current!.role)) redirect(`/painel/pacientes/${id}/testes/${testId}`);
  const [a, professionals] = await Promise.all([
    getAssessment(current!.institution_id, id, testId),
    listProfessionals(current!.institution_id),
  ]);
  if (!a) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Editar ${instrumentLabel(a.instrument, a.instrument_name)}`}
        description={a.patient?.full_name}
        back={{ href: `/painel/pacientes/${id}/testes/${testId}`, label: "Teste" }}
      />
      <AssessmentForm
        institutionId={current!.institution_id}
        patientId={id}
        professionals={professionals}
        currentUserId={access!.user_id}
        initial={{
          id: a.id,
          instrument: a.instrument,
          instrument_name: a.instrument_name,
          applied_at: a.applied_at,
          applied_by: a.applied_by,
          scores: a.scores ?? {},
          notes: a.notes,
          file_name: a.file_name,
        }}
      />
    </div>
  );
}
