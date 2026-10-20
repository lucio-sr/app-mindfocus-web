"use client";

import { useRouter } from "next/navigation";
import { Loader2, Plus, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CopyLink } from "@/components/app/copy-link";
import { DeliveryChoice, type Delivery } from "@/components/app/delivery-choice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { formatCpf, formatPhone, isValidCpf, onlyDigits } from "@/lib/br";
import { lookupGuardian, type FoundGuardian } from "@/lib/guardian-lookup";
import { CONSENT_TERM_VERSION, RELATIONSHIPS } from "@/lib/labels";
import { callFunctionAsUser, createClient } from "@/lib/supabase/client";

export type LinkedGuardian = {
  guardian_id: string;
  relationship: string;
  full_name: string;
  email: string;
  phone: string | null;
  cpf: string;
};

const MAX_GUARDIANS = 3;
const withCurrent = (current: string) => (RELATIONSHIPS.includes(current) ? RELATIONSHIPS : [current, ...RELATIONSHIPS]);

// Responsáveis de um paciente: mudar parentesco, remover (revoga o consentimento, mantém o histórico)
// e incluir outro (Edge Function create-guardian com o paciente existente).
export function GuardianManager({
  institutionId,
  patientId,
  patientFirstName,
  guardians,
  isPlatformAdmin,
}: {
  institutionId: string;
  patientId: string;
  patientFirstName: string;
  guardians: LinkedGuardian[];
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string; link?: string }>();
  const [adding, setAdding] = useState(false);

  async function changeRelationship(guardianId: string, relationship: string) {
    setBusy(guardianId);
    setMessage(undefined);
    const { error } = await createClient()
      .from("patient_guardians")
      .update({ relationship })
      .eq("patient_id", patientId)
      .eq("guardian_id", guardianId);
    setBusy(undefined);
    if (error) setMessage({ tone: "error", text: "Não foi possível mudar o parentesco." });
    else router.refresh();
  }

  async function remove(guardianId: string) {
    setBusy(guardianId);
    setMessage(undefined);
    const { error } = await createClient().rpc("remove_patient_guardian", { p_patient_id: patientId, p_guardian_id: guardianId });
    setBusy(undefined);
    setConfirming(undefined);
    if (error) {
      setMessage({
        tone: "error",
        text: error.code === "23514" ? "O paciente precisa manter ao menos um responsável." : "Não foi possível remover.",
      });
      return;
    }
    setMessage({ tone: "success", text: "Responsável removido. O consentimento dele foi revogado e fica no histórico." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <div className="flex flex-col gap-2">
          <Alert tone={message.tone}>{message.text}</Alert>
          {message.link && <CopyLink url={message.link} />}
        </div>
      )}

      <ul className="flex flex-col divide-y divide-ink/8">
        {guardians.map((g) => (
          <li key={g.guardian_id} className="flex flex-col gap-3 py-4 first:pt-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{g.full_name}</p>
                <p className="text-ink/65">
                  CPF {formatCpf(g.cpf)} · {g.email}
                  {g.phone && ` · ${formatPhone(g.phone)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`rel-${g.guardian_id}`}>
                  Parentesco
                </label>
                <select
                  id={`rel-${g.guardian_id}`}
                  value={g.relationship}
                  disabled={busy === g.guardian_id}
                  onChange={(e) => changeRelationship(g.guardian_id, e.target.value)}
                  className="h-9 rounded-lg border border-ink/15 bg-white px-2 text-sm"
                >
                  {withCurrent(g.relationship).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {guardians.length > 1 && (
                  <button
                    type="button"
                    disabled={busy === g.guardian_id}
                    onClick={() => setConfirming(g.guardian_id)}
                    className="h-9 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
            {confirming === g.guardian_id && (
              <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
                <p className="text-red-800">
                  Remover {g.full_name.split(" ")[0]} como responsável por {patientFirstName}? Ele(a) perde o acesso aos dados de{" "}
                  {patientFirstName} e o consentimento dele(a) é revogado (o registro continua no histórico).
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => remove(g.guardian_id)} loading={busy === g.guardian_id} className="bg-red-600 hover:bg-red-700">
                    Remover
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(undefined)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <AddGuardianForm
          institutionId={institutionId}
          patientId={patientId}
          patientFirstName={patientFirstName}
          existingCpfs={guardians.map((g) => g.cpf)}
          isPlatformAdmin={isPlatformAdmin}
          onCancel={() => setAdding(false)}
          onDone={(text, link) => {
            setAdding(false);
            setMessage({ tone: "success", text, link });
            router.refresh();
          }}
        />
      ) : (
        guardians.length < MAX_GUARDIANS && (
          <button
            type="button"
            onClick={() => {
              setMessage(undefined);
              setAdding(true);
            }}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-dashed border-ink/25 px-4 py-2.5 text-sm font-medium text-ink/75 hover:border-brand-blue hover:text-brand-blue"
          >
            <Plus className="size-4" aria-hidden /> Adicionar responsável
          </button>
        )
      )}
    </div>
  );
}

function AddGuardianForm({
  institutionId,
  patientId,
  patientFirstName,
  existingCpfs,
  isPlatformAdmin,
  onCancel,
  onDone,
}: {
  institutionId: string;
  patientId: string;
  patientFirstName: string;
  existingCpfs: string[];
  isPlatformAdmin: boolean;
  onCancel: () => void;
  onDone: (message: string, link?: string) => void;
}) {
  const [cpf, setCpf] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "found" | "new">("idle");
  const [found, setFound] = useState<FoundGuardian>();
  const [person, setPerson] = useState({ full_name: "", email: "", phone: "" });
  const [relationship, setRelationship] = useState("Pai");
  const [consent, setConsent] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>("email");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onCpf(value: string) {
    const formatted = formatCpf(value);
    const digits = onlyDigits(formatted);
    setCpf(formatted);
    setStatus("idle");
    setFound(undefined);
    setErrors({});
    if (digits.length !== 11 || !isValidCpf(digits)) return;
    if (existingCpfs.includes(digits)) {
      setErrors({ cpf: `Já é responsável por ${patientFirstName}.` });
      return;
    }
    setStatus("searching");
    const result = await lookupGuardian(institutionId, digits);
    setFound(result ?? undefined);
    setStatus(result ? "found" : "new");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found_: Record<string, string> = {};
    if (status !== "found" && status !== "new") found_.cpf = errors.cpf || "Informe um CPF válido.";
    if (status === "new") {
      if (!person.full_name.trim()) found_.full_name = "Informe o nome.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) found_.email = "E-mail inválido.";
    }
    if (!consent) found_.consent = "É preciso registrar o consentimento.";
    setErrors(found_);
    if (Object.keys(found_).length > 0) return;

    setLoading(true);
    setFormError(undefined);
    const guardian = status === "found" ? { full_name: found!.full_name, email: found!.email } : person;
    const res = await callFunctionAsUser<{ guardian: { created: boolean; action_link?: string } }>("create-guardian", {
      institution_id: institutionId,
      guardian: { ...guardian, cpf: onlyDigits(cpf) },
      patients: [{ patient_id: patientId, relationship }],
      consent_term_version: CONSENT_TERM_VERSION,
      delivery,
      redirect_to: `${window.location.origin}/definir-senha`,
    });
    setLoading(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    const name = guardian.full_name.split(" ")[0];
    const access = !res.data.guardian.created
      ? ""
      : delivery === "email"
        ? ` Enviamos um convite para ${guardian.email}.`
        : delivery === "link"
          ? " Envie o link abaixo para criar a senha (vale por 1 hora)."
          : " Ele(a) cria a senha em “Esqueci minha senha”, com o CPF.";
    onDone(`${name} agora é responsável por ${patientFirstName}.${access}`, res.data.guardian.action_link);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-2xl border border-brand-blue/30 bg-brand-blue/5 p-5">
      <h3 className="font-bold">Novo responsável</h3>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="relative">
          <Field label="CPF" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => onCpf(e.target.value)} error={errors.cpf} autoFocus />
          {status === "searching" && <Loader2 className="absolute top-[38px] right-3 size-4 animate-spin text-ink/40" aria-label="Buscando" />}
        </div>
        <SelectField label="Parentesco" value={relationship} onChange={(e) => setRelationship(e.target.value)} options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))} />

        {status === "found" && found && (
          <div className="flex items-start gap-3 rounded-xl bg-white p-4 sm:col-span-2">
            <UserRound className="mt-0.5 size-5 text-brand-green-dark" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">{found.full_name}</p>
              <p className="text-ink/65">{found.email}</p>
              {found.knownFor.length > 0 && <p className="mt-1 text-ink/65">Já é responsável por {found.knownFor.join(", ")}.</p>}
            </div>
          </div>
        )}

        {status === "new" && (
          <>
            <Field label="Nome completo" autoComplete="off" value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} error={errors.full_name} className="sm:col-span-2" />
            <Field label="E-mail" type="email" autoComplete="off" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} error={errors.email} />
            <Field label="Telefone (opcional)" inputMode="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: formatPhone(e.target.value) })} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" checked={consent} aria-invalid={Boolean(errors.consent)} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-brand-blue" />
          <span>
            O responsável leu e aceitou o termo de consentimento para os dados de {patientFirstName} (versão {CONSENT_TERM_VERSION}).
          </span>
        </label>
        {errors.consent && <p className="text-sm text-red-600">{errors.consent}</p>}
      </div>

      {status === "new" && <DeliveryChoice value={delivery} onChange={setDelivery} isPlatformAdmin={isPlatformAdmin} />}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          Adicionar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
