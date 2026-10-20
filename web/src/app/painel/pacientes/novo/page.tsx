import { Suspense } from "react";
import { PatientWizard, type GuardianDraft } from "@/components/patients/patient-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { formatCpf, formatPhone } from "@/lib/br";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Novo paciente" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewPatientPage({ searchParams }: PageProps<"/painel/pacientes/novo">) {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Novo paciente" back={{ href: "/painel/pacientes", label: "Pacientes" }} />
      <Suspense fallback={<PageLoading />}>
        <Wizard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type SiblingGuardian = {
  relationship: string;
  guardian: { full_name: string; cpf: string; email: string; phone: string | null } | null;
};

// ?irmao=<id>: novo paciente com os mesmos responsáveis de um paciente já cadastrado.
async function Wizard({ searchParams }: Pick<PageProps<"/painel/pacientes/novo">, "searchParams">) {
  const [{ irmao }, access, current] = await Promise.all([searchParams, getAccess(), getCurrentInstitution()]);
  const institutionId = current!.institution_id;

  let initialGuardians: GuardianDraft[] | undefined;
  let siblingOf: string | undefined;
  if (typeof irmao === "string" && UUID.test(irmao)) {
    const supabase = await createClient();
    const { data: sibling } = await supabase
      .from("patients")
      .select("full_name, guardians:patient_guardians(relationship, guardian:profiles(full_name, cpf, email, phone))")
      .eq("id", irmao)
      .eq("institution_id", institutionId)
      .maybeSingle();
    if (sibling) {
      siblingOf = sibling.full_name.split(" ")[0];
      initialGuardians = (sibling.guardians as unknown as SiblingGuardian[])
        .filter((g) => g.guardian)
        .map((g) => ({
          cpf: formatCpf(g.guardian!.cpf),
          full_name: g.guardian!.full_name,
          email: g.guardian!.email,
          phone: g.guardian!.phone ? formatPhone(g.guardian!.phone) : "",
          relationship: g.relationship,
          status: "found",
          knownFor: [sibling.full_name],
        }));
    }
  }

  return (
    <PatientWizard
      key={typeof irmao === "string" ? irmao : "novo"}
      institutionId={institutionId}
      isPlatformAdmin={access!.is_platform_admin}
      initialGuardians={initialGuardians}
      siblingOf={siblingOf}
    />
  );
}
