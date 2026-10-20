import { createClient } from "@/lib/supabase/server";
import type { InstrumentId, Scores } from "@/lib/instruments";

export type AssessmentRow = {
  id: string;
  patient_id: string;
  instrument: InstrumentId;
  instrument_name: string | null;
  applied_at: string | null;
  applied_by: string | null;
  scores: Scores;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
  professional: { full_name: string } | null;
  patient: { full_name: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Um teste do paciente na instituição em uso (null se não existir ou não for visível).
export async function getAssessment(institutionId: string, patientId: string, testId: string) {
  if (!UUID.test(patientId) || !UUID.test(testId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("neuropsych_assessments")
    .select(
      "id, patient_id, instrument, instrument_name, applied_at, applied_by, scores, notes, file_path, file_name, created_at, updated_at, professional:profiles!neuropsych_assessments_applied_by_fkey(full_name), patient:patients(full_name)",
    )
    .eq("id", testId)
    .eq("patient_id", patientId)
    .eq("institution_id", institutionId)
    .maybeSingle();
  return data as unknown as AssessmentRow | null;
}
