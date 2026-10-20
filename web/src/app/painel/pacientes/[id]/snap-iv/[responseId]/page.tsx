import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getCurrentInstitution } from "@/lib/access";
import { formatDateTime } from "@/lib/labels";
import { channelLabel, SNAP_CUTOFF, SNAP_ITEMS, SNAP_OPTIONS, SNAP_SUBSCALES, type SnapScores } from "@/lib/snap-iv";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "SNAP-IV" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SnapResponsePage(props: PageProps<"/painel/pacientes/[id]/snap-iv/[responseId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SnapResponse {...props} />
    </Suspense>
  );
}

type Row = {
  ended_at: string | null;
  created_at: string;
  channel: string | null;
  answers: { items: number[] };
  scores: SnapScores;
  guardian: { full_name: string } | null;
  patient: { full_name: string } | null;
};

async function SnapResponse({ params }: PageProps<"/painel/pacientes/[id]/snap-iv/[responseId]">) {
  const { id, responseId } = await params;
  if (!UUID.test(id) || !UUID.test(responseId)) notFound();
  const current = await getCurrentInstitution();
  const supabase = await createClient();
  const { data } = await supabase
    .from("questionnaire_responses")
    .select("ended_at, created_at, channel, answers, scores, guardian:profiles!questionnaire_responses_guardian_id_fkey(full_name), patient:patients(full_name)")
    .eq("id", responseId)
    .eq("patient_id", id)
    .eq("institution_id", current!.institution_id)
    .eq("instrument", "snap_iv")
    .maybeSingle();
  const r = data as unknown as Row | null;
  if (!r) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="SNAP-IV"
        description={`${r.patient?.full_name} · respondido por ${r.guardian?.full_name ?? "responsável removido"} em ${formatDateTime(r.ended_at ?? r.created_at)} (${channelLabel[r.channel ?? ""] ?? "—"})`}
        back={{ href: `/painel/pacientes/${id}`, label: "Ficha do paciente" }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {SNAP_SUBSCALES.map((s) => {
          const score = r.scores[s.key];
          const above = score.count >= SNAP_CUTOFF;
          return (
            <div key={s.key} className={`rounded-2xl border p-5 ${above ? "border-sand bg-sand/15" : "border-ink/10 bg-white"}`}>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="mt-2 font-heading text-3xl font-extrabold">
                {score.count}
                <span className="text-lg text-ink/45"> / 9</span>
              </p>
              <p className="text-sm text-ink/65">itens marcados como “Bastante” ou “Demais” · média {score.mean.toLocaleString("pt-BR")}</p>
              {above && <p className="mt-2 text-sm font-semibold text-[#8a6420]">Atinge o ponto de corte de rastreio ({SNAP_CUTOFF} ou mais).</p>}
            </div>
          );
        })}
      </div>

      <p className="mb-6 flex items-start gap-2 text-sm text-ink/60">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        O SNAP-IV é um instrumento de rastreio. O resultado orienta a avaliação, mas não estabelece diagnóstico.
      </p>

      {SNAP_SUBSCALES.map((s) => (
        <Card key={s.key} title={s.label} className="mb-6">
          <ol className="-my-2 divide-y divide-ink/8">
            {SNAP_ITEMS.slice(s.range[0], s.range[1]).map((text, j) => {
              const i = s.range[0] + j;
              const v = r.answers.items[i];
              return (
                <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="w-6 shrink-0 font-semibold text-ink/40 tabular-nums">{i + 1}</span>
                  <span className="flex-1">{text}</span>
                  <span className={`shrink-0 font-semibold ${v >= 2 ? "text-[#8a6420]" : "text-ink/60"}`}>{SNAP_OPTIONS[v] ?? "—"}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      ))}
    </div>
  );
}
