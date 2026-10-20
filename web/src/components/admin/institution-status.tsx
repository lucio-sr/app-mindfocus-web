"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Suspender / reativar (só superadmin; garantido pelo trigger guard_institution_update).
// Suspensa: colaboradores e responsáveis perdem acesso aos dados, e o jogo deixa de enviar.
export function InstitutionStatus({ id, status }: { id: string; status: "active" | "pending" | "suspended" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const next = status === "active" ? "suspended" : "active";

  async function apply() {
    setLoading(true);
    setError(undefined);
    const { error } = await createClient().from("institutions").update({ status: next }).eq("id", id);
    setLoading(false);
    setConfirming(false);
    if (error) setError("Não foi possível alterar a situação.");
    else router.refresh();
  }

  if (next === "suspended" && confirming) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
        <p className="text-red-800">
          Suspender bloqueia o acesso de toda a equipe e dos responsáveis aos dados desta instituição, e o jogo
          deixa de enviar resultados. Nada é apagado. Confirmar?
        </p>
        <div className="flex gap-2">
          <Button onClick={apply} loading={loading} className="bg-red-600 hover:bg-red-700">
            Suspender
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={next === "active" ? "secondary" : "ghost"}
        loading={loading}
        onClick={() => (next === "suspended" ? setConfirming(true) : apply())}
        className={next === "suspended" ? "border border-red-200 text-red-700 hover:bg-red-50" : ""}
      >
        {next === "active" ? "Reativar instituição" : "Suspender instituição"}
      </Button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
