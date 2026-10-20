"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Excluir teste (só admin da instituição): apaga o anexo e o registro.
export function DeleteAssessment({ id, patientId, filePath }: { id: string; patientId: string; filePath: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setLoading(true);
    const supabase = createClient();
    if (filePath) await supabase.storage.from("assessments").remove([filePath]);
    const { error } = await supabase.from("neuropsych_assessments").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError("Não foi possível excluir.");
      return;
    }
    router.push(`/painel/pacientes/${patientId}`);
    router.refresh();
  }

  if (!confirming)
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)} className="text-red-700 hover:bg-red-50">
        Excluir teste
      </Button>
    );
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
      <p className="text-red-800">Excluir este teste e o anexo? Não dá para desfazer.</p>
      {error && <p className="text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={remove} loading={loading} className="bg-red-600 hover:bg-red-700">
          Excluir
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
