"use client";

import { useRouter } from "next/navigation";
import { FileText, Paperclip, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import {
  getInstrument,
  INSTRUMENTS,
  parseScore,
  scoreKey,
  withComputed,
  type InstrumentId,
  type Scores,
} from "@/lib/instruments";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";

export type AssessmentInitial = {
  id: string;
  instrument: InstrumentId;
  instrument_name: string | null;
  applied_at: string | null;
  applied_by: string | null;
  scores: Scores;
  notes: string | null;
  file_name: string | null;
};

type Professional = { id: string; name: string };

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = "application/pdf,image/jpeg,image/png";
const today = new Date().toISOString().slice(0, 10);

const extFor = (file: File) =>
  file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : null;

// Registro ou edição de um teste neuropsicológico, com anexo opcional (bucket assessments).
export function AssessmentForm({
  institutionId,
  patientId,
  professionals,
  currentUserId,
  initial,
  initialInstrument,
}: {
  institutionId: string;
  patientId: string;
  professionals: Professional[];
  currentUserId: string;
  initial?: AssessmentInitial;
  initialInstrument?: InstrumentId;
}) {
  const router = useRouter();
  const [instrumentId, setInstrumentId] = useState<InstrumentId>(initial?.instrument ?? initialInstrument ?? "tavis");
  const [instrumentName, setInstrumentName] = useState(initial?.instrument_name ?? "");
  const [appliedAt, setAppliedAt] = useState(initial?.applied_at ?? today);
  const [appliedBy, setAppliedBy] = useState(
    initial?.applied_by ?? (professionals.some((p) => p.id === currentUserId) ? currentUserId : ""),
  );
  // Valores como texto enquanto se digita; convertidos ao salvar.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial?.scores ?? {}).map(([k, v]) => [k, String(v).replace(".", ",")])),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const instrument = getInstrument(instrumentId);
  const isEdit = Boolean(initial);

  function collectScores(): Scores {
    const scores: Scores = {};
    for (const table of instrument.tables) {
      for (const row of table.rows) {
        for (const col of table.columns) {
          const key = scoreKey(row.key, col.key);
          if (row.skip?.includes(col.key) || instrument.computed?.[key]) continue;
          const v = parseScore(values[key] ?? "", col.kind);
          if (v !== undefined) scores[key] = v;
        }
      }
    }
    return withComputed(instrument, scores);
  }

  const preview = collectScores();

  function onFile(f: File | undefined) {
    setFileError(undefined);
    if (!f) return setFile(undefined);
    if (!extFor(f)) return setFileError("Envie PDF, JPG ou PNG.");
    if (f.size > MAX_BYTES) return setFileError("O arquivo passa de 20 MB.");
    setFile(f);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (instrumentId === "other" && !instrumentName.trim()) found.instrument_name = "Informe o nome do instrumento.";
    if (!appliedAt) found.applied_at = "Informe a data.";
    else if (appliedAt > today) found.applied_at = "Data no futuro.";
    for (const table of instrument.tables)
      for (const row of table.rows)
        for (const col of table.columns) {
          const key = scoreKey(row.key, col.key);
          if ((col.kind ?? "number") === "number" && values[key]?.trim() && parseScore(values[key]) === undefined)
            found[key] = "Número inválido";
        }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    setLoading(true);
    setFormError(undefined);
    const supabase = createClient();
    const row = {
      instrument: instrumentId,
      instrument_name: instrumentId === "other" ? instrumentName.trim() : null,
      applied_at: appliedAt,
      applied_by: appliedBy || null,
      scores: collectScores() as Json,
      notes: notes.trim() || null,
    };

    let id = initial?.id;
    if (id) {
      const { error } = await supabase.from("neuropsych_assessments").update(row).eq("id", id);
      if (error) return fail("Não foi possível salvar o teste.");
    } else {
      const { data, error } = await supabase
        .from("neuropsych_assessments")
        .insert({ ...row, institution_id: institutionId, patient_id: patientId })
        .select("id")
        .single();
      if (error || !data) return fail(error?.code === "42501" ? "Só administradores e psicólogos registram testes." : "Não foi possível salvar o teste.");
      id = data.id;
    }

    if (file) {
      // Caminho fixo por teste: substituir o anexo sobrescreve o mesmo objeto (o nome original fica em file_name).
      const path = `${institutionId}/${patientId}/${id}/anexo`;
      const { error: upErr } = await supabase.storage.from("assessments").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        setLoading(false);
        router.push(`/painel/pacientes/${patientId}/testes/${id}?anexo=erro`);
        return;
      }
      await supabase.from("neuropsych_assessments").update({ file_path: path, file_name: file.name }).eq("id", id);
    }

    router.push(`/painel/pacientes/${patientId}/testes/${id}`);
    router.refresh();

    function fail(message: string) {
      setLoading(false);
      setFormError(message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert tone="error">{formError}</Alert>}

      {!isEdit && (
        <fieldset>
          <legend className="mb-3 text-sm font-medium">Instrumento</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INSTRUMENTS.map((i) => (
              <label
                key={i.id}
                className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 transition-colors ${
                  instrumentId === i.id ? "border-brand-blue bg-brand-blue/5 ring-2 ring-brand-blue/20" : "border-ink/15 bg-white hover:bg-cream/50"
                }`}
              >
                <input type="radio" name="instrument" value={i.id} checked={instrumentId === i.id} onChange={() => setInstrumentId(i.id)} className="sr-only" />
                <span className="font-heading text-lg font-extrabold">{i.name}</span>
                <span className="text-xs text-ink/60">{i.fullName}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <section className="rounded-2xl border border-ink/10 bg-white p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold">{instrument.fullName}</h2>
          <p className="mt-0.5 text-sm text-ink/60">{instrument.description}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {instrumentId === "other" && (
            <Field label="Nome do instrumento" value={instrumentName} onChange={(e) => setInstrumentName(e.target.value)} error={errors.instrument_name} className="sm:col-span-3" />
          )}
          <Field label="Data de aplicação" type="date" max={today} value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} error={errors.applied_at} />
          <SelectField
            label="Aplicado por"
            value={appliedBy}
            onChange={(e) => setAppliedBy(e.target.value)}
            options={[{ value: "", label: "—" }, ...professionals.map((p) => ({ value: p.id, label: p.name }))]}
            className="sm:col-span-2"
          />
        </div>
      </section>

      {instrument.tables.map((table) => (
        <section key={table.title} className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="text-lg font-bold">{table.title}</h2>
          {table.description && <p className="mt-0.5 text-sm text-ink/60">{table.description}</p>}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-xs text-ink/60">
                  <th className="pb-2 text-left font-semibold" />
                  {table.columns.map((c) => (
                    <th key={c.key} className="px-1.5 pb-2 text-left font-semibold">
                      {c.label}
                      {c.unit && <span className="font-normal text-ink/45"> ({c.unit})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.key}>
                    <th className="py-1.5 pr-3 text-left align-middle font-medium">
                      {r.label}
                      {r.hint && <span className="block text-xs font-normal text-ink/50">{r.hint}</span>}
                    </th>
                    {table.columns.map((c) => {
                      const key = scoreKey(r.key, c.key);
                      if (r.skip?.includes(c.key)) return <td key={c.key} />;
                      const computed = instrument.computed?.[key];
                      const listId = c.suggestions ? `list-${c.key}` : undefined;
                      return (
                        <td key={c.key} className="px-1.5 py-1.5">
                          <input
                            aria-label={`${r.label} — ${c.label}`}
                            aria-invalid={Boolean(errors[key])}
                            inputMode={c.kind === "text" ? "text" : "decimal"}
                            list={listId}
                            readOnly={Boolean(computed)}
                            value={computed ? (preview[key] === undefined ? "" : String(preview[key]).replace(".", ",")) : (values[key] ?? "")}
                            placeholder={computed ? "auto" : ""}
                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                            className={`h-10 w-full min-w-24 rounded-lg border px-2.5 text-right tabular-nums focus:ring-3 focus:outline-none ${
                              computed
                                ? "border-transparent bg-cream/60 text-ink/70"
                                : errors[key]
                                  ? "border-red-400 focus:ring-red-100"
                                  : "border-ink/15 focus:border-brand-blue focus:ring-brand-blue/15"
                            } ${c.kind === "text" ? "text-left" : ""}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.columns
              .filter((c) => c.suggestions)
              .map((c) => (
                <datalist key={c.key} id={`list-${c.key}`}>
                  {c.suggestions!.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-white p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium">
            Observações clínicas
          </label>
          <textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-[15px] focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/15 focus:outline-none" />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Protocolo aplicado (PDF ou imagem, até 20 MB)</span>
          {file ? (
            <span className="inline-flex items-center gap-2 self-start rounded-xl bg-cream px-3 py-2 text-sm">
              <FileText className="size-4 text-sand-dark" aria-hidden /> {file.name}
              <button type="button" onClick={() => setFile(undefined)} aria-label="Remover arquivo" className="rounded p-0.5 hover:bg-sand/30">
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-xl border border-dashed border-ink/25 px-4 py-2.5 text-sm font-medium text-ink/75 hover:border-brand-blue hover:text-brand-blue">
              <Paperclip className="size-4" aria-hidden />
              {initial?.file_name ? `Substituir anexo (${initial.file_name})` : "Anexar arquivo"}
              <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
          {fileError && <p className="text-sm text-red-600">{fileError}</p>}
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={loading}>
          {isEdit ? "Salvar alterações" : "Registrar teste"}
        </Button>
      </div>
    </form>
  );
}
