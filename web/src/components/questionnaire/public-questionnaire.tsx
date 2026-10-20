"use client";

import { CircleCheck, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { SnapIvRunner } from "@/components/questionnaire/snap-iv-runner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { callFunction } from "@/lib/supabase/client";

type Status = "ok" | "verified" | "submitted" | "wrong_birthdate" | "locked" | "completed" | "expired" | "revoked" | "invalid";
type OpenResult = { status: Status; institution_name?: string; patient_first_name?: string; guardian_first_name?: string };

const closed: Partial<Record<Status, { title: string; text: string }>> = {
  completed: { title: "Questionário já respondido", text: "Este link já foi usado. Obrigado pela participação!" },
  expired: { title: "Link expirado", text: "Peça um novo link à equipe que acompanha a criança." },
  revoked: { title: "Link cancelado", text: "Este link não vale mais. Peça um novo à equipe que acompanha a criança." },
  locked: {
    title: "Link bloqueado",
    text: "A data de nascimento foi informada errada várias vezes. Peça um novo link à equipe que acompanha a criança.",
  },
  invalid: { title: "Link inválido", text: "Confira se o endereço foi copiado inteiro ou peça um novo link." },
};

// Fluxo do link: abre → confirma a data de nascimento → responde → enviado.
export function PublicQuestionnaire({ token }: { token: string }) {
  const [state, setState] = useState<OpenResult | null>(null);
  const [birthdate, setBirthdate] = useState("");
  const [verifyError, setVerifyError] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    callFunction<OpenResult>("questionnaire", { action: "open", token }).then((r) =>
      setState(r.ok ? r.data : { status: "invalid" }),
    );
  }, [token]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!birthdate) return setVerifyError("Informe a data de nascimento.");
    setVerifying(true);
    setVerifyError(undefined);
    const r = await callFunction<OpenResult>("questionnaire", { action: "verify", token, birthdate });
    setVerifying(false);
    if (!r.ok) return setVerifyError(r.message);
    if (r.data.status === "wrong_birthdate") return setVerifyError("A data não confere. Confira e tente de novo.");
    setState(r.data);
  }

  async function submit(answers: { items: number[] }, startedAt: string) {
    const r = await callFunction<OpenResult>("questionnaire", { action: "submit", token, birthdate, answers, started_at: startedAt });
    if (!r.ok) return r.message;
    if (r.data.status !== "submitted") {
      setState(r.data);
      return null;
    }
    setState({ ...state!, status: "submitted" });
    return null;
  }

  if (!state)
    return (
      <p className="flex items-center gap-2 text-ink/60">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
      </p>
    );

  const message = closed[state.status];
  if (message)
    return (
      <div className="rounded-2xl border border-ink/10 bg-white p-6">
        <h1 className="text-2xl font-extrabold">{message.title}</h1>
        <p className="mt-2 text-ink/70">{message.text}</p>
      </div>
    );

  if (state.status === "submitted")
    return (
      <div className="flex flex-col items-center rounded-2xl border border-ink/10 bg-white p-8 text-center">
        <CircleCheck className="size-12 text-brand-green" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold">Respostas enviadas!</h1>
        <p className="mt-2 text-ink/70">
          Muito obrigado por dedicar esse tempo. A equipe de {state.institution_name} já pode ver as respostas. Pode fechar esta página.
        </p>
      </div>
    );

  if (state.status === "ok" || state.status === "wrong_birthdate")
    return (
      <form onSubmit={verify} noValidate className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-white p-6">
        <div>
          <h1 className="text-2xl font-extrabold">Questionário sobre a criança</h1>
          <p className="mt-2 text-ink/70">
            {state.institution_name} pediu que você responda um questionário curto (18 frases, cerca de 5 minutos) sobre o
            comportamento da criança no dia a dia.
          </p>
        </div>
        <Field
          label="Para começar, informe a data de nascimento da criança"
          type="date"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          error={verifyError}
        />
        <p className="flex items-start gap-2 text-sm text-ink/60">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-green-dark" aria-hidden />
          Pedimos a data para confirmar que o link chegou à pessoa certa. As respostas ficam visíveis só para a equipe que acompanha a criança.
        </p>
        <Button type="submit" loading={verifying} className="h-12 text-base">
          Continuar
        </Button>
      </form>
    );

  // verified
  if (!started)
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-white p-6">
        <h1 className="text-2xl font-extrabold">
          Olá{state.guardian_first_name ? `, ${state.guardian_first_name}` : ""}!
        </h1>
        <p className="text-ink/75">
          Vamos ler 18 frases sobre {state.patient_first_name}. Para cada uma, escolha o quanto ela descreve o jeito de{" "}
          {state.patient_first_name}: <strong>nem um pouco</strong>, <strong>só um pouco</strong>, <strong>bastante</strong> ou{" "}
          <strong>demais</strong>. Não existe resposta certa ou errada — responda pensando no dia a dia.
        </p>
        <Button onClick={() => setStarted(true)} variant="secondary" className="h-12 text-base">
          Começar
        </Button>
      </div>
    );

  return <SnapIvRunner childName={state.patient_first_name ?? "a criança"} onSubmit={submit} />;
}
