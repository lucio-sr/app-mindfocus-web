"use client";

import { Gamepad2, KeyRound } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";

// Gera o PIN de 8 dígitos para o paciente entrar no jogo (RPC issue_access_code).
// O PIN só aparece agora (o banco guarda o hash); gerar outro invalida o anterior.
export function GamePin({ patientId, firstName }: { patientId: string; firstName: string }) {
  const [pin, setPin] = useState<{ code: string; expires_at: string }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function issue() {
    setLoading(true);
    setError(undefined);
    const { data, error } = await createClient().rpc("issue_access_code", { p_patient_id: patientId, p_purpose: "game" });
    setLoading(false);
    if (error || !data?.[0]) {
      setError("Não foi possível gerar o PIN.");
      return;
    }
    setPin(data[0]);
  }

  return (
    <div className="flex flex-col gap-4">
      {pin ? (
        <div className="rounded-2xl bg-brand-blue p-6 text-center text-white">
          <p className="text-sm text-white/80">PIN do jogo para {firstName}</p>
          <p className="my-2 font-heading text-4xl font-extrabold tracking-[0.25em] tabular-nums">
            {pin.code.slice(0, 4)} {pin.code.slice(4)}
          </p>
          <p className="text-sm text-white/80">Vale uma vez, até {formatDateTime(pin.expires_at)}.</p>
        </div>
      ) : (
        <p className="flex items-start gap-3 text-sm text-ink/70">
          <Gamepad2 className="mt-0.5 size-5 shrink-0 text-brand-blue" aria-hidden />
          Gere um PIN e digite-o no jogo MindFocus para iniciar uma sessão de {firstName}.
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Button onClick={issue} loading={loading} variant={pin ? "ghost" : "primary"}>
        <KeyRound className="size-4" aria-hidden />
        {pin ? "Gerar outro PIN" : "Gerar PIN do jogo"}
      </Button>
      {pin && <p className="text-xs text-ink/55">Gerar outro PIN invalida este.</p>}
    </div>
  );
}
