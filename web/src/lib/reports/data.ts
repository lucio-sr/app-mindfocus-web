import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ageFrom, gameLabel } from "@/lib/labels";
import type { SnapScores } from "@/lib/snap-iv";

// Dados de um paciente para o relatório/devolutiva. Lidos com a sessão de quem gera o documento
// (RLS garante que é da instituição dele).

export type GameKey = keyof typeof gameLabel;
export const GAME_ORDER: GameKey[] = ["gonogo", "tmt_a", "tmt_b", "genius", "stroop"];

export type GameResult = {
  test: GameKey;
  hits: number | null;
  errors: number | null;
  // Taxa de acerto da análise idiográfica: acertos / (acertos + erros). null = não realizado.
  hitRate: number | null;
  seconds: number | null;
  metrics: Record<string, unknown>;
};

export type ReportSettings = Database["public"]["Tables"]["institution_report_settings"]["Row"];

export type ReportData = {
  institution: { id: string; name: string; city: string | null; uf: string | null; logo: Buffer | null; partnerLogos: Buffer[] };
  settings: ReportSettings | null;
  professional: { name: string; crp: string | null };
  patient: Database["public"]["Tables"]["patients"]["Row"] & { age: number };
  guardians: string[];
  session: { id: string; date: string; sessionsCount: number; results: GameResult[]; meanHitRate: number | null } | null;
  snap: { date: string; scores: SnapScores } | null;
  neuro: Partial<Record<"tavis" | "fdt" | "neupsilin", { date: string | null; scores: Record<string, number | string> }>>;
};

const seconds = (a: string | null, b: string | null) =>
  a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 100) / 10) : null;

export function hitRate(hits: number | null, errors: number | null): number | null {
  const total = (hits ?? 0) + (errors ?? 0);
  if (hits === null || total === 0) return null;
  return Math.round((hits / total) * 1000) / 10;
}

async function download(supabase: SupabaseClient<Database>, bucket: string, path: string | null): Promise<Buffer | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

export async function loadReportData(
  supabase: SupabaseClient<Database>,
  institutionId: string,
  patientId: string,
  userId: string,
): Promise<ReportData | null> {
  const [patientRes, instRes, settingsRes, profileRes, guardiansRes, sessionsRes, snapRes, neuroRes] = await Promise.all([
    supabase.from("patients").select("*").eq("id", patientId).eq("institution_id", institutionId).maybeSingle(),
    supabase.from("institutions").select("id, name, city, uf, logo_path").eq("id", institutionId).single(),
    supabase.from("institution_report_settings").select("*").eq("institution_id", institutionId).maybeSingle(),
    supabase.from("profiles").select("full_name, crp_number").eq("id", userId).single(),
    supabase.from("patient_guardians").select("guardian:profiles(full_name)").eq("patient_id", patientId),
    supabase
      .from("game_sessions")
      .select("id, started_at, created_at, results:game_results(test, attempt, hits, total_errors, started_at, ended_at, metrics)")
      .eq("patient_id", patientId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("questionnaire_responses")
      .select("ended_at, created_at, scores")
      .eq("patient_id", patientId)
      .eq("instrument", "snap_iv")
      .not("scores", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("neuropsych_assessments")
      .select("instrument, applied_at, created_at, scores")
      .eq("patient_id", patientId)
      .in("instrument", ["tavis", "fdt", "neupsilin"])
      .order("applied_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);
  const patient = patientRes.data;
  if (!patient || !instRes.data) return null;

  type Row = { test: GameKey; attempt: number; hits: number | null; total_errors: number | null; started_at: string | null; ended_at: string | null; metrics: Record<string, unknown> };
  const sessions = ((sessionsRes.data ?? []) as unknown as { id: string; started_at: string | null; created_at: string; results: Row[] }[]).filter(
    (s) => s.results.length > 0,
  );
  const latest = sessions[0];
  let session: ReportData["session"] = null;
  if (latest) {
    const results = GAME_ORDER.flatMap((test) => {
      const r = latest.results.filter((x) => x.test === test).sort((a, b) => a.attempt - b.attempt)[0];
      if (!r) return [];
      return [{ test, hits: r.hits, errors: r.total_errors, hitRate: hitRate(r.hits, r.total_errors), seconds: seconds(r.started_at, r.ended_at), metrics: r.metrics ?? {} }];
    });
    const rates = results.map((r) => r.hitRate).filter((r): r is number => r !== null);
    session = {
      id: latest.id,
      date: latest.started_at ?? latest.created_at,
      sessionsCount: sessions.length,
      results,
      // Média só dos jogos realizados (o sistema anterior contava jogo não jogado como 0%).
      meanHitRate: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null,
    };
  }

  const neuro: ReportData["neuro"] = {};
  for (const a of neuroRes.data ?? []) {
    const key = a.instrument as "tavis" | "fdt" | "neupsilin";
    if (!neuro[key]) neuro[key] = { date: a.applied_at, scores: (a.scores ?? {}) as Record<string, number | string> };
  }

  const snapRow = snapRes.data?.[0];
  const inst = instRes.data;
  const settings = settingsRes.data;
  const [logo, ...partnerLogos] = await Promise.all([
    download(supabase, "institution-logos", inst.logo_path),
    ...(settings?.partner_logo_paths ?? []).map((p) => download(supabase, "institution-logos", p)),
  ]);
  const profile = profileRes.data;

  return {
    institution: { id: inst.id, name: inst.name, city: inst.city, uf: inst.uf, logo, partnerLogos: partnerLogos.filter((b): b is Buffer => b !== null) },
    settings,
    professional: {
      name: profile?.full_name ?? "",
      crp: profile?.crp_number ?? null,
    },
    patient: { ...patient, age: ageFrom(patient.birthdate) },
    guardians: ((guardiansRes.data ?? []) as unknown as { guardian: { full_name: string } | null }[])
      .map((g) => g.guardian?.full_name)
      .filter((n): n is string => Boolean(n)),
    session,
    snap: snapRow ? { date: snapRow.ended_at ?? snapRow.created_at, scores: snapRow.scores as unknown as SnapScores } : null,
    neuro,
  };
}
