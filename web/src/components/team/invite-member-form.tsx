"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CopyLink } from "@/components/app/copy-link";
import { DeliveryChoice, type Delivery } from "@/components/app/delivery-choice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/br";
import { roleLabel } from "@/lib/labels";
import { callFunctionAsUser } from "@/lib/supabase/client";

type Result = { created: boolean; status: string; action_link?: string };

const statusMessage: Record<string, string> = {
  created: "incluído(a) na equipe",
  reactivated: "religado(a) à equipe",
  updated: "teve o papel atualizado",
  unchanged: "já fazia parte da equipe com esse papel",
};

// Inclui colaborador (Edge Function invite-member). Conta nova recebe convite conforme `delivery`.
export function InviteMemberForm({ institutionId, isPlatformAdmin }: { institutionId: string; isPlatformAdmin: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("psychologist");
  const [delivery, setDelivery] = useState<Delivery>("email");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "error" | "success"; message: string; link?: string }>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Informe o nome.";
    if (!isValidCpf(cpf)) found.cpf = "CPF inválido.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = "E-mail inválido.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    setResult(undefined);
    const res = await callFunctionAsUser<Result>("invite-member", {
      institution_id: institutionId,
      role,
      person: { full_name: name, cpf: onlyDigits(cpf), email },
      delivery,
      redirect_to: `${window.location.origin}/definir-senha`,
    });
    setLoading(false);
    if (!res.ok) {
      setResult({ tone: "error", message: res.message });
      return;
    }
    const who = name.split(" ")[0];
    const access = !res.data.created
      ? ""
      : delivery === "email"
        ? ` Enviamos o convite para ${email}.`
        : delivery === "link"
          ? " Envie o link abaixo para a pessoa criar a senha (vale por 1 hora)."
          : " A pessoa cria a senha em “Esqueci minha senha”, com o CPF.";
    setResult({ tone: "success", message: `${who} ${statusMessage[res.data.status] ?? "foi incluído(a)"}.${access}`, link: res.data.action_link });
    setName("");
    setCpf("");
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {result && <Alert tone={result.tone}>{result.message}</Alert>}
      {result?.link && <CopyLink url={result.link} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} className="sm:col-span-2" />
        <Field label="CPF" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} error={errors.cpf} />
        <Field label="E-mail" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <SelectField
          label="Papel"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={Object.entries(roleLabel).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <DeliveryChoice value={delivery} onChange={setDelivery} isPlatformAdmin={isPlatformAdmin} />
      <Button type="submit" loading={loading} className="self-start">
        Incluir na equipe
      </Button>
    </form>
  );
}
