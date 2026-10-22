import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ClipboardList, Paperclip, Pencil, Plus } from "lucide-react";
import { Suspense } from "react";
import { GamePin } from "@/components/patients/game-pin";
import { SnapIvPanel, type SnapRequest, type SnapResponse } from "@/components/questionnaire/snap-iv-panel";
import { ReportsPanel, type ReportItem } from "@/components/reports/reports-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getCurrentInstitution } from "@/lib/access";
import { canRegisterTests } from "@/lib/assessments";
import { instrumentLabel } from "@/lib/instruments";
import { formatCpf, formatPhone } from "@/lib/br";
import { ageFrom, formatDate, formatDateTime, gameLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Paciente" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PatientPage({ params }: PageProps<"/painel/pacientes/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PatientDetail params={params} />
    </Suspense>
  );
}

type Guardian = {
  relationship: string;
  income: string | null;
  guardian: { id: string; full_name: string; email: string; phone: string | null } | null;
};
type Test = {
  id: string;
  instrument: string;
  instrument_name: string | null;
  applied_at: string | null;
  file_path: string | null;
  professional: { full_name: string } | null;
};
type Session = {
  id: string;
  started_at: string | null;
  created_at: string;
  app_version: string | null;
  results: { test: keyof typeof gameLabel }[];
};

async function PatientDetail({ params }: Pick<PageProps<"/painel/pacientes/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const current = await getCurrentInstitution();
  const supabase = await createClient();
  const [
    { data: patient },
    { data: guardians },
    { data: sessions },
    { data: consents },
    { data: tests },
    { data: snapResponses },
    { data: snapRequests },
    { data: reports },
  ] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).eq("institution_id", current!.institution_id).maybeSingle(),
    supabase
      .from("patient_guardians")
      .select("relationship, income, guardian:profiles(id, full_name, email, phone)")
      .eq("patient_id", id),
    supabase
      .from("game_sessions")
      .select("id, started_at, created_at, app_version, results:game_results(test)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("consents")
      .select("term_version, accepted_at, revoked_at, guardian:profiles(full_name)")
      .eq("patient_id", id)
      .order("accepted_at", { ascending: false }),
    supabase
      .from("neuropsych_assessments")
      .select("id, instrument, instrument_name, applied_at, file_path, professional:profiles!neuropsych_assessments_applied_by_fkey(full_name)")
      .eq("patient_id", id)
      .order("applied_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("questionnaire_responses")
      .select("id, ended_at, created_at, channel, scores, guardian:profiles!questionnaire_responses_guardian_id_fkey(full_name)")
      .eq("patient_id", id)
      .eq("instrument", "snap_iv")
      .order("created_at", { ascending: false }),
    supabase
      .from("questionnaire_requests")
      .select("id, expires_at, created_at, guardian_id")
      .eq("patient_id", id)
      .is("completed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("reports")
      .select("id, kind, title, created_at, storage_path, created_by")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!patient) notFound();

  const authorIds = [...new Set((reports ?? []).map((r) => r.created_by).filter((v): v is string => Boolean(v)))];
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] as { id: string; full_name: string }[] };

  const firstName = patient.full_name.split(" ")[0];
  const guardianList = ((guardians ?? []) as unknown as Guardian[]).filter((g) => g.guardian);
  const school = [
    patient.education,
    patient.public_school === null ? null : patient.public_school ? "escola pública" : "escola particular",
  ].filter(Boolean);
  const diagnoses = [patient.adhd_diagnosis && "TDAH", patient.autism_diagnosis && "TEA"].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title={patient.full_name}
        description={`${ageFrom(patient.birthdate)} anos · nascimento em ${formatDate(patient.birthdate)}${patient.cpf ? ` · CPF ${formatCpf(patient.cpf)}` : ""}`}
        back={{ href: "/painel/pacientes", label: "Pacientes" }}
        actions={
          <LinkButton href={`/painel/pacientes/${patient.id}/editar`} variant="outline">
            <Pencil className="size-4" aria-hidden /> Editar
          </LinkButton>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card title="Sessões de jogo">
            {(sessions ?? []).length === 0 ? (
              <p className="text-sm text-ink/60">Nenhuma sessão ainda. Gere um PIN para {firstName} jogar.</p>
            ) : (
              <ul className="divide-y divide-ink/8">
                {(sessions as unknown as Session[]).map((s) => {
                  const tests = [...new Set(s.results.map((r) => r.test))];
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span className="font-medium">{formatDateTime(s.started_at ?? s.created_at)}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {tests.length === 0 ? (
                          <Badge>Sem resultados</Badge>
                        ) : (
                          tests.map((t) => (
                            <Badge key={t} tone="blue">
                              {gameLabel[t]}
                            </Badge>
                          ))
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            title="Testes neuropsicológicos"
            actions={
              canRegisterTests(current!.role) && (
                <Link
                  href={`/painel/pacientes/${patient.id}/testes/novo`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
                >
                  <Plus className="size-4" aria-hidden /> Registrar teste
                </Link>
              )
            }
          >
            {(tests ?? []).length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ink/60">
                <ClipboardList className="size-4" aria-hidden /> Nenhum teste registrado (TAVIS, FDT, NEUPSILIN-Inf…).
              </p>
            ) : (
              <ul className="-my-2 divide-y divide-ink/8">
                {(tests as unknown as Test[]).map((t) => (
                  <li key={t.id}>
                    <Link href={`/painel/pacientes/${patient.id}/testes/${t.id}`} className="group flex items-center gap-3 py-3">
                      <Badge tone="sand">{instrumentLabel(t.instrument, t.instrument_name)}</Badge>
                      <span className="flex-1 text-sm">
                        {formatDate(t.applied_at)}
                        {t.professional && <span className="text-ink/55"> · {t.professional.full_name}</span>}
                      </span>
                      {t.file_path && <Paperclip className="size-4 text-ink/40" aria-label="Com anexo" />}
                      <ChevronRight className="size-4 text-ink/30 group-hover:text-brand-blue" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="SNAP-IV (responsáveis)">
            <SnapIvPanel
              patientId={patient.id}
              firstName={firstName}
              guardians={guardianList.map((g) => ({ id: g.guardian!.id, name: g.guardian!.full_name, relationship: g.relationship }))}
              responses={((snapResponses ?? []) as unknown as (Omit<SnapResponse, "guardian"> & { guardian: { full_name: string } | null })[]).map(
                (r) => ({ ...r, guardian: r.guardian?.full_name ?? null }),
              )}
              requests={(snapRequests ?? []).map(
                (r): SnapRequest => ({
                  id: r.id,
                  expires_at: r.expires_at,
                  created_at: r.created_at,
                  guardian: guardianList.find((g) => g.guardian?.id === r.guardian_id)?.guardian?.full_name ?? "—",
                }),
              )}
            />
          </Card>

          <Card title="Relatório e devolutiva">
            <ReportsPanel
              patientId={patient.id}
              canGenerate={canRegisterTests(current!.role)}
              canDelete={current!.role === "admin"}
              hasSession={(sessions as unknown as Session[] | null)?.some((s) => s.results.length > 0) ?? false}
              reports={(reports ?? []).map(
                (r): ReportItem => ({
                  id: r.id,
                  kind: r.kind,
                  title: r.title,
                  created_at: r.created_at,
                  storage_path: r.storage_path,
                  author: authors?.find((a) => a.id === r.created_by)?.full_name ?? null,
                }),
              )}
            />
          </Card>

          <Card title="Dados e anamnese">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Info label="Gênero" value={patient.gender} />
              <Info label="UF" value={patient.uf} />
              <Info label="Escolaridade" value={school.join(", ")} />
              <Info label="Irmãos" value={String(patient.siblings)} />
              <Info label="Reprovações" value={String(patient.school_failure_times)} />
              <Info label="Abandonos escolares" value={String(patient.school_dropout_times)} />
              <Info label="Medicações" value={patient.medications.join(", ")} />
              <Info label="Diagnósticos prévios" value={diagnoses.join(", ")} />
              <div className="sm:col-span-2">
                <Info label="Observações" value={patient.notes} />
              </div>
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Jogo">
            <GamePin patientId={patient.id} firstName={firstName} />
          </Card>

          <Card
            title="Responsáveis"
            actions={
              <Link href={`/painel/pacientes/${patient.id}/editar`} className="text-sm font-medium text-brand-blue hover:underline">
                Gerenciar
              </Link>
            }
          >
            {(guardians ?? []).length === 0 ? (
              <p className="text-sm text-ink/60">Nenhum responsável vinculado.</p>
            ) : (
              <ul className="flex flex-col gap-4 text-sm">
                {(guardians as unknown as Guardian[]).map((g) => (
                  <li key={g.guardian?.id}>
                    <p className="font-semibold">
                      {g.guardian?.full_name} <span className="font-normal text-ink/55">· {g.relationship}</span>
                    </p>
                    <p className="text-ink/65">{g.guardian?.email}</p>
                    {g.guardian?.phone && <p className="text-ink/65">{formatPhone(g.guardian.phone)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Consentimento">
            {(consents ?? []).length === 0 ? (
              <p className="text-sm text-ink/60">Nenhum consentimento registrado.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {consents!.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>
                      {(c.guardian as unknown as { full_name: string } | null)?.full_name.split(" ")[0] ?? "—"} · termo {c.term_version} ·{" "}
                      {formatDate(c.accepted_at)}
                    </span>
                    {c.revoked_at ? <Badge tone="red">Revogado</Badge> : <Badge tone="green">Válido</Badge>}
                  </li>
                ))}
              </ul>
            )}
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
