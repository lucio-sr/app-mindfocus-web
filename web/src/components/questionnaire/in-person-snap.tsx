"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SnapIvRunner } from "@/components/questionnaire/snap-iv-runner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Aplicação presencial: o colaborador entrega o tablet ao responsável.
export function InPersonSnap({
  patientId,
  childName,
  guardian,
}: {
  patientId: string;
  childName: string;
  guardian: { id: string; name: string };
}) {
  const router = useRouter();
  const [started, setStarted] = useState(false);

  async function submit(answers: { items: number[] }, startedAt: string) {
    const { data, error } = await createClient().rpc("submit_questionnaire_in_person", {
      p_patient_id: patientId,
      p_guardian_id: guardian.id,
      p_answers: answers,
      p_started_at: startedAt,
    });
    if (error || !data) return "Não foi possível enviar. Tente de novo.";
    router.push(`/painel/pacientes/${patientId}/snap-iv/${data}`);
    router.refresh();
    return null;
  }

  if (!started)
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="text-2xl font-extrabold">Olá, {guardian.name.split(" ")[0]}!</h2>
        <p className="text-ink/75">
          Vamos ler 18 frases sobre {childName}. Para cada uma, escolha o quanto ela descreve o jeito de {childName}:{" "}
          <strong>nem um pouco</strong>, <strong>só um pouco</strong>, <strong>bastante</strong> ou <strong>demais</strong>. Não existe
          resposta certa ou errada — responda pensando no dia a dia.
        </p>
        <Button onClick={() => setStarted(true)} variant="secondary" className="h-12 text-base">
          Começar
        </Button>
      </div>
    );

  return <SnapIvRunner childName={childName} onSubmit={submit} />;
}
