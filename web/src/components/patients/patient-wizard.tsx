"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { CopyLink } from "@/components/app/copy-link";
import { DeliveryChoice, type Delivery } from "@/components/app/delivery-choice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { formatCpf, formatPhone, isValidCpf, onlyDigits } from "@/lib/br";
import { CONSENT_TERM_VERSION, EDUCATION, formatDate, GENDERS, RELATIONSHIPS, UFS } from "@/lib/labels";
import { lookupGuardian } from "@/lib/guardian-lookup";
import { callFunctionAsUser } from "@/lib/supabase/client";

// Cadastro "criança primeiro", em 3 etapas: Criança → Responsáveis → Confirmar.
// Anamnese (medicações, diagnósticos, histórico escolar) fica para a ficha do paciente.

export type GuardianDraft = {
  cpf: string;
  full_name: string;
  email: string;
  phone: string;
  relationship: string;
  // found: já é responsável nesta instituição (dados vêm do cadastro e não são editados aqui)
  status: "idle" | "searching" | "found" | "new";
  knownFor?: string[]; // nomes dos pacientes de quem já é responsável
};

type Child = { full_name: string; birthdate: string; cpf: string; gender: string; education: string; public_school: string; uf: string };
type Result = { patient_id: string; guardians: { created: boolean; action_link?: string }[] };
type Errors = Record<string, string>;

const STEPS = ["Criança", "Responsáveis", "Confirmar"];
const MAX_GUARDIANS = 3;
const today = new Date().toISOString().slice(0, 10);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const emptyChild: Child = { full_name: "", birthdate: "", cpf: "", gender: "", education: "", public_school: "", uf: "" };
const emptyGuardian = (relationship = "Mãe"): GuardianDraft => ({
  cpf: "",
  full_name: "",
  email: "",
  phone: "",
  relationship,
  status: "idle",
});

export function PatientWizard({
  institutionId,
  isPlatformAdmin,
  initialGuardians,
  siblingOf,
}: {
  institutionId: string;
  isPlatformAdmin: boolean;
  initialGuardians?: GuardianDraft[];
  siblingOf?: string;
}) {
  const [step, setStep] = useState(0);
  const [child, setChild] = useState<Child>(emptyChild);
  const [guardians, setGuardians] = useState<GuardianDraft[]>(initialGuardians?.length ? initialGuardians : [emptyGuardian()]);
  const [consent, setConsent] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>("email");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>();

  const updateGuardian = (i: number, patch: Partial<GuardianDraft>) =>
    setGuardians((list) => list.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  // Ao completar um CPF válido, procura a pessoa entre os responsáveis desta instituição.
  async function onGuardianCpf(i: number, value: string) {
    const cpf = formatCpf(value);
    const digits = onlyDigits(cpf);
    updateGuardian(i, { cpf, status: "idle", full_name: "", email: "", phone: "", knownFor: undefined });
    if (digits.length !== 11 || !isValidCpf(digits)) return;
    if (guardians.some((g, j) => j !== i && onlyDigits(g.cpf) === digits)) {
      setErrors((e) => ({ ...e, [`g${i}.cpf`]: "Este responsável já está na lista." }));
      return;
    }
    setErrors((e) => ({ ...e, [`g${i}.cpf`]: "" }));
    updateGuardian(i, { status: "searching" });

    const found = await lookupGuardian(institutionId, digits);
    if (found) {
      updateGuardian(i, {
        status: "found",
        full_name: found.full_name,
        email: found.email,
        phone: found.phone ?? "",
        knownFor: found.knownFor,
      });
    } else {
      updateGuardian(i, { status: "new" });
    }
  }

  function validateStep(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      if (!child.full_name.trim()) e.full_name = "Informe o nome.";
      if (!child.birthdate) e.birthdate = "Informe a data de nascimento.";
      else if (child.birthdate > today) e.birthdate = "Data no futuro.";
      if (child.cpf && !isValidCpf(child.cpf)) e.cpf = "CPF inválido.";
    }
    if (s === 1) {
      guardians.forEach((g, i) => {
        if (!isValidCpf(g.cpf)) e[`g${i}.cpf`] = "Informe um CPF válido.";
        else if (onlyDigits(g.cpf) === onlyDigits(child.cpf)) e[`g${i}.cpf`] = "É o CPF da criança.";
        else if (g.status === "searching" || g.status === "idle") e[`g${i}.cpf`] = "Aguarde a busca do CPF.";
        if (g.status === "new") {
          if (!g.full_name.trim()) e[`g${i}.full_name`] = "Informe o nome.";
          if (!isEmail(g.email)) e[`g${i}.email`] = "E-mail inválido.";
        }
      });
      const cpfs = guardians.map((g) => onlyDigits(g.cpf));
      cpfs.forEach((c, i) => {
        if (c && cpfs.indexOf(c) !== i) e[`g${i}.cpf`] = "Responsável repetido.";
      });
    }
    if (s === 2 && !consent) e.consent = "É preciso registrar o consentimento.";
    return e;
  }

  function next() {
    const found = validateStep(step);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step < 2) return next();
    const found = validateStep(2);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    setLoading(true);
    setFormError(undefined);
    const res = await callFunctionAsUser<Result>("create-patient", {
      institution_id: institutionId,
      patient: {
        full_name: child.full_name,
        birthdate: child.birthdate,
        cpf: onlyDigits(child.cpf) || undefined,
        gender: child.gender || undefined,
        education: child.education || undefined,
        public_school: child.public_school === "" ? undefined : child.public_school === "sim",
        uf: child.uf || undefined,
      },
      guardians: guardians.map((g) => ({
        full_name: g.full_name,
        cpf: onlyDigits(g.cpf),
        email: g.email,
        phone: g.status === "new" ? g.phone : undefined,
        relationship: g.relationship,
      })),
      consent_term_version: CONSENT_TERM_VERSION,
      delivery,
      redirect_to: `${window.location.origin}/definir-senha`,
    });
    setLoading(false);
    if (!res.ok) {
      setFormError(res.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setResult(res.data);
  }

  const firstName = child.full_name.trim().split(" ")[0];
  const newGuardians = guardians.filter((g) => g.status === "new");

  if (result) {
    const links = result.guardians
      .map((g, i) => ({ ...g, name: guardians[i]?.full_name }))
      .filter((g) => g.action_link);
    const created = result.guardians.filter((g) => g.created).length;
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-white p-8">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-8 text-brand-green" aria-hidden />
          <h2 className="text-2xl font-extrabold">{firstName} foi cadastrado(a)!</h2>
        </div>
        {created > 0 && (
          <p className="text-ink/70">
            {delivery === "email"
              ? "Os responsáveis novos receberão um e-mail para criar a senha."
              : delivery === "link"
                ? "Envie a cada responsável novo o link de acesso (vale por 1 hora)."
                : "Os responsáveis novos criam a senha em “Esqueci minha senha”, com o CPF."}
          </p>
        )}
        {links.map((l) => (
          <div key={l.action_link} className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{l.name}</p>
            <CopyLink url={l.action_link!} />
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/painel/pacientes/${result.patient_id}`}
            className="inline-flex h-11 items-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-blue-dark"
          >
            Abrir ficha e gerar PIN
          </Link>
          <a
            href={`/painel/pacientes/novo?irmao=${result.patient_id}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink/15 bg-white px-5 text-sm font-semibold hover:bg-cream"
          >
            <Plus className="size-4" aria-hidden /> Cadastrar irmão(ã)
          </a>
          <Link href="/painel/pacientes" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold hover:bg-cream">
            Voltar para pacientes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Stepper current={step} />
      {siblingOf && step === 0 && (
        <Alert tone="success">Responsáveis de {siblingOf} já preenchidos. Confira na próxima etapa.</Alert>
      )}
      {formError && <Alert tone="error">{formError}</Alert>}

      {step === 0 && (
        <Panel title="Quem é a criança?" description="Só o essencial agora. A anamnese é preenchida depois, na ficha.">
          <Field label="Nome completo" autoComplete="off" value={child.full_name} onChange={(e) => setChild({ ...child, full_name: e.target.value })} error={errors.full_name} className="sm:col-span-2" autoFocus />
          <Field label="Data de nascimento" type="date" max={today} value={child.birthdate} onChange={(e) => setChild({ ...child, birthdate: e.target.value })} error={errors.birthdate} />
          <SelectField label="Gênero" value={child.gender} onChange={(e) => setChild({ ...child, gender: e.target.value })} options={[{ value: "", label: "—" }, ...GENDERS.map((g) => ({ value: g, label: g }))]} />
          <SelectField label="Escolaridade" value={child.education} onChange={(e) => setChild({ ...child, education: e.target.value })} options={[{ value: "", label: "—" }, ...EDUCATION.map((v) => ({ value: v, label: v }))]} />
          <SelectField label="Escola" value={child.public_school} onChange={(e) => setChild({ ...child, public_school: e.target.value })} options={[{ value: "", label: "—" }, { value: "sim", label: "Pública" }, { value: "nao", label: "Particular" }]} />
          <Field label="CPF da criança (opcional)" inputMode="numeric" placeholder="000.000.000-00" value={child.cpf} onChange={(e) => setChild({ ...child, cpf: formatCpf(e.target.value) })} error={errors.cpf} />
          <SelectField label="UF" value={child.uf} onChange={(e) => setChild({ ...child, uf: e.target.value })} options={[{ value: "", label: "—" }, ...UFS.map((uf) => ({ value: uf, label: uf }))]} />
        </Panel>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          {guardians.map((g, i) => (
            <Panel
              key={i}
              title={guardians.length > 1 ? `Responsável ${i + 1}` : `Responsável por ${firstName}`}
              description={i === 0 ? "Digite o CPF: se a pessoa já for responsável aqui, os dados aparecem sozinhos." : undefined}
              action={
                guardians.length > 1 && (
                  <button type="button" onClick={() => setGuardians((list) => list.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">
                    <Trash2 className="size-4" aria-hidden /> Remover
                  </button>
                )
              }
            >
              <div className="relative">
                <Field label="CPF" inputMode="numeric" placeholder="000.000.000-00" value={g.cpf} onChange={(e) => onGuardianCpf(i, e.target.value)} error={errors[`g${i}.cpf`] || undefined} autoFocus={i === guardians.length - 1 && !g.cpf} />
                {g.status === "searching" && <Loader2 className="absolute top-[38px] right-3 size-4 animate-spin text-ink/40" aria-label="Buscando" />}
              </div>
              <SelectField label="Parentesco" value={g.relationship} onChange={(e) => updateGuardian(i, { relationship: e.target.value })} options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))} />

              {g.status === "found" && (
                <div className="flex items-start gap-3 rounded-xl bg-brand-green/10 p-4 sm:col-span-2">
                  <UserRound className="mt-0.5 size-5 text-brand-green-dark" aria-hidden />
                  <div className="text-sm">
                    <p className="font-semibold">{g.full_name}</p>
                    <p className="text-ink/65">{g.email}</p>
                    {g.knownFor && g.knownFor.length > 0 && <p className="mt-1 text-ink/65">Já é responsável por {g.knownFor.join(", ")}.</p>}
                  </div>
                </div>
              )}

              {g.status === "new" && (
                <>
                  <Field label="Nome completo" autoComplete="off" value={g.full_name} onChange={(e) => updateGuardian(i, { full_name: e.target.value })} error={errors[`g${i}.full_name`]} className="sm:col-span-2" autoFocus />
                  <Field label="E-mail" type="email" autoComplete="off" hint="Para o acesso e a recuperação de senha." value={g.email} onChange={(e) => updateGuardian(i, { email: e.target.value })} error={errors[`g${i}.email`]} />
                  <Field label="Telefone (opcional)" inputMode="tel" value={g.phone} onChange={(e) => updateGuardian(i, { phone: formatPhone(e.target.value) })} />
                </>
              )}
            </Panel>
          ))}
          {guardians.length < MAX_GUARDIANS && (
            <button
              type="button"
              onClick={() => setGuardians((list) => [...list, emptyGuardian(list[0]?.relationship === "Mãe" ? "Pai" : "Mãe")])}
              className="inline-flex items-center gap-2 self-start rounded-xl border border-dashed border-ink/25 px-4 py-2.5 text-sm font-medium text-ink/75 hover:border-brand-blue hover:text-brand-blue"
            >
              <Plus className="size-4" aria-hidden /> Adicionar outro responsável
            </button>
          )}
        </div>
      )}

      {step === 2 && (
        <>
          <Panel title="Confira os dados">
            <Summary label="Criança">
              <p className="font-semibold">{child.full_name}</p>
              <p className="text-ink/65">
                {formatDate(child.birthdate)}
                {[child.gender, child.education, child.public_school && (child.public_school === "sim" ? "escola pública" : "escola particular")]
                  .filter(Boolean)
                  .map((v) => ` · ${v}`)}
              </p>
            </Summary>
            <Summary label={guardians.length > 1 ? "Responsáveis" : "Responsável"}>
              <ul className="flex flex-col gap-2">
                {guardians.map((g) => (
                  <li key={g.cpf}>
                    <p className="font-semibold">
                      {g.full_name} <span className="font-normal text-ink/55">· {g.relationship}</span>
                    </p>
                    <p className="text-ink/65">
                      {g.email} · {g.status === "found" ? "já cadastrado(a)" : "novo acesso"}
                    </p>
                  </li>
                ))}
              </ul>
            </Summary>
          </Panel>

          <Panel title="Consentimento e acesso">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={consent} aria-invalid={Boolean(errors.consent)} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-brand-blue" />
                <span>
                  {guardians.length > 1 ? "Os responsáveis leram e aceitaram" : "O responsável leu e aceitou"} o termo de consentimento para coleta e uso
                  dos dados de {firstName} (versão {CONSENT_TERM_VERSION}).
                </span>
              </label>
              {errors.consent && <p className="text-sm text-red-600">{errors.consent}</p>}
            </div>
            {newGuardians.length > 0 && (
              <div className="sm:col-span-2">
                <DeliveryChoice value={delivery} onChange={setDelivery} isPlatformAdmin={isPlatformAdmin} />
              </div>
            )}
          </Panel>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </Button>
        ) : (
          <Link href="/painel/pacientes" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold hover:bg-cream">
            Cancelar
          </Link>
        )}
        <Button type="submit" loading={loading}>
          {step < 2 ? (
            <>
              Próximo <ArrowRight className="size-4" aria-hidden />
            </>
          ) : (
            "Cadastrar"
          )}
        </Button>
      </div>
    </form>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Etapas do cadastro">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                done ? "bg-brand-green text-white" : active ? "bg-brand-blue text-white" : "bg-ink/10 text-ink/50"
              }`}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={`text-sm font-semibold ${active ? "text-ink" : "text-ink/50"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 rounded ${done ? "bg-brand-green" : "bg-ink/10"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink/60">{description}</p>}
        </div>
        {action}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Summary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm sm:col-span-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink/45">{label}</p>
      {children}
    </div>
  );
}
