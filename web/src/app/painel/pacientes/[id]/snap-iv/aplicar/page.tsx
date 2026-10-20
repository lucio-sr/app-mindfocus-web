import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InPersonSnap } from "@/components/questionnaire/in-person-snap";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getCurrentInstitution } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Aplicar SNAP-IV" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ApplySnapPage(props: PageProps<"/painel/pacientes/[id]/snap-iv/aplicar">) {
  return (
    <div className="mx-auto max-w-xl">
      <Suspense fallback={<PageLoading />}>
        <ApplySnap {...props} />
      </Suspense>
    </div>
  );
}

async function ApplySnap({ params, searchParams }: PageProps<"/painel/pacientes/[id]/snap-iv/aplicar">) {
  const [{ id }, { responsavel }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id) || typeof responsavel !== "string" || !UUID.test(responsavel)) notFound();
  const current = await getCurrentInstitution();
  const supabase = await createClient();
  const { data } = await supabase
    .from("patient_guardians")
    .select("patient:patients!inner(full_name, institution_id), guardian:profiles(id, full_name)")
    .eq("patient_id", id)
    .eq("guardian_id", responsavel)
    .eq("institution_id", current!.institution_id)
    .maybeSingle();
  const link = data as unknown as { patient: { full_name: string }; guardian: { id: string; full_name: string } | null } | null;
  if (!link?.guardian) notFound();

  return (
    <>
      <PageHeader title="SNAP-IV" description={`Sobre ${link.patient.full_name}`} back={{ href: `/painel/pacientes/${id}`, label: "Ficha do paciente" }} />
      <InPersonSnap patientId={id} childName={link.patient.full_name.split(" ")[0]} guardian={{ id: link.guardian.id, name: link.guardian.full_name }} />
    </>
  );
}
