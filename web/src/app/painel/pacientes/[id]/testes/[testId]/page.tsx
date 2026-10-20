import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Suspense } from "react";
import { AttachmentLink } from "@/components/assessments/attachment-link";
import { DeleteAssessment } from "@/components/assessments/delete-assessment";
import { ScoreTables } from "@/components/assessments/score-tables";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getCurrentInstitution } from "@/lib/access";
import { getAssessment } from "@/lib/assessment-query";
import { canRegisterTests } from "@/lib/assessments";
import { getInstrument, instrumentLabel } from "@/lib/instruments";
import { formatDate } from "@/lib/labels";

export const metadata = { title: "Teste neuropsicológico" };

export default function AssessmentPage(props: PageProps<"/painel/pacientes/[id]/testes/[testId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Assessment {...props} />
    </Suspense>
  );
}

async function Assessment({ params, searchParams }: PageProps<"/painel/pacientes/[id]/testes/[testId]">) {
  const [{ id, testId }, { anexo }] = await Promise.all([params, searchParams]);
  const current = await getCurrentInstitution();
  const a = await getAssessment(current!.institution_id, id, testId);
  if (!a) notFound();
  const instrument = getInstrument(a.instrument);
  const canEdit = canRegisterTests(current!.role);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={instrumentLabel(a.instrument, a.instrument_name)}
        description={`${a.patient?.full_name ?? ""} · aplicado em ${formatDate(a.applied_at)}${a.professional ? ` por ${a.professional.full_name}` : ""}`}
        back={{ href: `/painel/pacientes/${id}`, label: "Ficha do paciente" }}
        actions={
          canEdit && (
            <LinkButton href={`/painel/pacientes/${id}/testes/${testId}/editar`} variant="outline">
              <Pencil className="size-4" aria-hidden /> Editar
            </LinkButton>
          )
        }
      />

      {anexo === "erro" && (
        <div className="mb-6">
          <Alert tone="error">O teste foi salvo, mas o anexo não foi enviado. Use “Editar” para anexar de novo.</Alert>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {instrument.tables.length > 0 && (
          <Card title={instrument.fullName}>
            <ScoreTables instrument={instrument} scores={a.scores ?? {}} />
          </Card>
        )}
        <Card title="Observações e anexo">
          <p className="whitespace-pre-line text-sm">{a.notes || "Sem observações."}</p>
          <div className="mt-4 border-t border-ink/10 pt-4">
            {a.file_path ? <AttachmentLink path={a.file_path} fileName={a.file_name} /> : <p className="text-sm text-ink/60">Nenhum anexo.</p>}
          </div>
        </Card>
        {current!.role === "admin" && (
          <div className="flex justify-end">
            <DeleteAssessment id={a.id} patientId={id} filePath={a.file_path} />
          </div>
        )}
      </div>
    </div>
  );
}
