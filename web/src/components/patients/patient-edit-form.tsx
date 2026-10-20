"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/br";
import { EDUCATION, GENDERS, UFS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";

export type PatientData = {
  id: string;
  full_name: string;
  birthdate: string;
  cpf: string | null;
  gender: string | null;
  education: string | null;
  public_school: boolean | null;
  uf: string | null;
  siblings: number;
  school_failure_times: number;
  school_dropout_times: number;
  medications: string[];
  adhd_diagnosis: boolean;
  autism_diagnosis: boolean;
  notes: string | null;
};

const today = new Date().toISOString().slice(0, 10);
const withCurrent = (list: string[], current: string) =>
  current && !list.includes(current) ? [current, ...list] : list; // mantém valores antigos fora da lista

// Dados e anamnese do paciente. Grava direto na tabela (RLS: colaboradores da instituição).
export function PatientEditForm({ patient }: { patient: PatientData }) {
  const router = useRouter();
  const [f, setF] = useState({
    full_name: patient.full_name,
    birthdate: patient.birthdate,
    cpf: patient.cpf ? formatCpf(patient.cpf) : "",
    gender: patient.gender ?? "",
    education: patient.education ?? "",
    public_school: patient.public_school === null ? "" : patient.public_school ? "sim" : "nao",
    uf: patient.uf ?? "",
    siblings: String(patient.siblings),
    school_failure_times: String(patient.school_failure_times),
    school_dropout_times: String(patient.school_dropout_times),
    adhd_diagnosis: patient.adhd_diagnosis,
    autism_diagnosis: patient.autism_diagnosis,
    notes: patient.notes ?? "",
  });
  const [medications, setMedications] = useState<string[]>(patient.medications);
  const [medInput, setMedInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "error" | "success"; message: string }>();
  const [loading, setLoading] = useState(false);

  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));
  const count = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  function addMedication() {
    const name = medInput.trim().replace(/,$/, "");
    if (name && !medications.some((m) => m.toLowerCase() === name.toLowerCase())) setMedications([...medications, name]);
    setMedInput("");
  }

  function onMedKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addMedication();
    } else if (e.key === "Backspace" && !medInput && medications.length) {
      setMedications(medications.slice(0, -1));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!f.full_name.trim()) found.full_name = "Informe o nome.";
    if (!f.birthdate) found.birthdate = "Informe a data de nascimento.";
    else if (f.birthdate > today) found.birthdate = "Data no futuro.";
    if (f.cpf && !isValidCpf(f.cpf)) found.cpf = "CPF inválido.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    setLoading(true);
    setResult(undefined);
    const pending = medInput.trim();
    const meds = pending && !medications.includes(pending) ? [...medications, pending] : medications;
    const failures = count(f.school_failure_times);
    const dropouts = count(f.school_dropout_times);
    const { error } = await createClient()
      .from("patients")
      .update({
        full_name: f.full_name.trim(),
        birthdate: f.birthdate,
        cpf: onlyDigits(f.cpf) || null,
        gender: f.gender || null,
        education: f.education || null,
        public_school: f.public_school === "" ? null : f.public_school === "sim",
        uf: f.uf || null,
        siblings: count(f.siblings),
        school_failure: failures > 0,
        school_failure_times: failures,
        school_dropout: dropouts > 0,
        school_dropout_times: dropouts,
        medications: meds,
        adhd_diagnosis: f.adhd_diagnosis,
        autism_diagnosis: f.autism_diagnosis,
        notes: f.notes.trim() || null,
      })
      .eq("id", patient.id);
    setLoading(false);

    if (error) {
      setResult({
        tone: "error",
        message: error.code === "23505" ? "Já existe outro paciente com este CPF na instituição." : "Não foi possível salvar.",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setMedications(meds);
    setMedInput("");
    router.push(`/painel/pacientes/${patient.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {result && <Alert tone={result.tone}>{result.message}</Alert>}

      <Section title="Dados da criança">
        <Field label="Nome completo" value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} error={errors.full_name} className="sm:col-span-2" />
        <Field label="Data de nascimento" type="date" max={today} value={f.birthdate} onChange={(e) => set({ birthdate: e.target.value })} error={errors.birthdate} />
        <SelectField label="Gênero" value={f.gender} onChange={(e) => set({ gender: e.target.value })} options={[{ value: "", label: "—" }, ...withCurrent(GENDERS, f.gender).map((g) => ({ value: g, label: g }))]} />
        <SelectField label="Escolaridade" value={f.education} onChange={(e) => set({ education: e.target.value })} options={[{ value: "", label: "—" }, ...withCurrent(EDUCATION, f.education).map((v) => ({ value: v, label: v }))]} />
        <SelectField label="Escola" value={f.public_school} onChange={(e) => set({ public_school: e.target.value })} options={[{ value: "", label: "—" }, { value: "sim", label: "Pública" }, { value: "nao", label: "Particular" }]} />
        <Field label="CPF (opcional)" inputMode="numeric" placeholder="000.000.000-00" value={f.cpf} onChange={(e) => set({ cpf: formatCpf(e.target.value) })} error={errors.cpf} />
        <SelectField label="UF" value={f.uf} onChange={(e) => set({ uf: e.target.value })} options={[{ value: "", label: "—" }, ...UFS.map((uf) => ({ value: uf, label: uf }))]} />
      </Section>

      <Section title="Anamnese" description="Histórico escolar, medicações e diagnósticos prévios informados pela família.">
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
          <Field label="Irmãos" type="number" min={0} value={f.siblings} onChange={(e) => set({ siblings: e.target.value })} />
          <Field label="Reprovações" type="number" min={0} value={f.school_failure_times} onChange={(e) => set({ school_failure_times: e.target.value })} />
          <Field label="Abandonos escolares" type="number" min={0} value={f.school_dropout_times} onChange={(e) => set({ school_dropout_times: e.target.value })} />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="medications" className="text-sm font-medium">
            Medicações em uso
          </label>
          <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-2 py-1.5 focus-within:border-brand-blue focus-within:ring-3 focus-within:ring-brand-blue/15">
            {medications.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-lg bg-brand-blue/10 py-1 pr-1 pl-2.5 text-sm text-brand-blue-dark">
                {m}
                <button type="button" onClick={() => setMedications(medications.filter((x) => x !== m))} aria-label={`Remover ${m}`} className="rounded p-0.5 hover:bg-brand-blue/15">
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
            <input
              id="medications"
              value={medInput}
              onChange={(e) => setMedInput(e.target.value)}
              onKeyDown={onMedKey}
              onBlur={addMedication}
              placeholder={medications.length ? "" : "Digite e tecle Enter"}
              className="min-w-40 flex-1 bg-transparent px-1 py-1 text-[15px] outline-none"
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Diagnósticos prévios</legend>
          <Check checked={f.adhd_diagnosis} onChange={(v) => set({ adhd_diagnosis: v })}>
            TDAH
          </Check>
          <Check checked={f.autism_diagnosis} onChange={(v) => set({ autism_diagnosis: v })}>
            TEA (autismo)
          </Check>
        </fieldset>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="notes" className="text-sm font-medium">
            Observações
          </label>
          <textarea id="notes" rows={4} value={f.notes} onChange={(e) => set({ notes: e.target.value })} className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-[15px] focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/15 focus:outline-none" />
        </div>
      </Section>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.push(`/painel/pacientes/${patient.id}`)}>
          Cancelar
        </Button>
        <Button type="submit" loading={loading}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand-blue" />
      {children}
    </label>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink/60">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
