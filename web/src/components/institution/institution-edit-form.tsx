"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { formatCep, formatPhone, onlyDigits } from "@/lib/br";
import { UFS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";

type Editable = {
  name: string;
  legal_name: string;
  email: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
};

// Admin da instituição edita os dados cadastrais (documento e situação só o superadmin muda).
export function InstitutionEditForm({ id, initial, canEdit }: { id: string; initial: Editable; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [result, setResult] = useState<{ tone: "error" | "success"; message: string }>();
  const [loading, setLoading] = useState(false);

  const bind = (key: keyof Editable, format?: (v: string) => string) => ({
    value: form[key],
    disabled: !canEdit,
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: format ? format(e.target.value) : e.target.value })),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setResult({ tone: "error", message: "Informe o nome da instituição." });
      return;
    }
    setLoading(true);
    const clean = (v: string) => v.trim() || null;
    const { error } = await createClient()
      .from("institutions")
      .update({
        name: form.name.trim(),
        legal_name: clean(form.legal_name),
        email: clean(form.email),
        phone: clean(form.phone),
        cep: onlyDigits(form.cep) || null,
        street: clean(form.street),
        number: clean(form.number),
        complement: clean(form.complement),
        district: clean(form.district),
        city: clean(form.city),
        uf: form.uf || null,
      })
      .eq("id", id);
    setLoading(false);
    setResult(error ? { tone: "error", message: "Não foi possível salvar. Confira o CEP e o e-mail." } : { tone: "success", message: "Dados salvos." });
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {result && <Alert tone={result.tone}>{result.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" {...bind("name")} className="sm:col-span-2" />
        <Field label="Razão social" {...bind("legal_name")} className="sm:col-span-2" />
        <Field label="E-mail" type="email" {...bind("email")} />
        <Field label="Telefone" inputMode="tel" {...bind("phone", formatPhone)} />
        <Field label="CEP" inputMode="numeric" {...bind("cep", formatCep)} />
        <Field label="Rua" {...bind("street")} />
        <Field label="Número" {...bind("number")} />
        <Field label="Complemento" {...bind("complement")} />
        <Field label="Bairro" {...bind("district")} />
        <Field label="Cidade" {...bind("city")} />
        <SelectField
          label="UF"
          value={form.uf}
          disabled={!canEdit}
          onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))}
          options={[{ value: "", label: "—" }, ...UFS.map((uf) => ({ value: uf, label: uf }))]}
        />
      </div>
      {canEdit && (
        <Button type="submit" loading={loading} className="self-start">
          Salvar alterações
        </Button>
      )}
    </form>
  );
}
