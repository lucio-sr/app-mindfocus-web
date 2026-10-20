"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { CopyLink } from "@/components/app/copy-link";
import { DeliveryChoice, type Delivery } from "@/components/app/delivery-choice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import {
  formatCep,
  formatCpf,
  formatDocument,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "@/lib/br";
import { UFS } from "@/lib/labels";
import { callFunctionAsUser } from "@/lib/supabase/client";

type Me = { full_name: string; cpf: string; email: string };

const empty = {
  name: "",
  legal_name: "",
  document: "",
  email: "",
  phone: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  uf: "",
  admin_name: "",
  admin_cpf: "",
  admin_email: "",
};

type Form = typeof empty;
type Errors = Partial<Record<keyof Form, string>>;
type Created = { institution_id: string; admin: { created: boolean; action_link?: string } };

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function validate(f: Form): Errors {
  const e: Errors = {};
  const doc = onlyDigits(f.document);
  if (!f.name.trim()) e.name = "Informe o nome.";
  if (!(doc.length === 11 ? isValidCpf(doc) : isValidCnpj(doc))) e.document = "CNPJ ou CPF inválido.";
  if (f.email && !isEmail(f.email)) e.email = "E-mail inválido.";
  if (f.cep && onlyDigits(f.cep).length !== 8) e.cep = "CEP deve ter 8 dígitos.";
  if (!f.admin_name.trim()) e.admin_name = "Informe o nome.";
  if (!isValidCpf(f.admin_cpf)) e.admin_cpf = "CPF inválido.";
  if (!isEmail(f.admin_email)) e.admin_email = "E-mail inválido.";
  return e;
}

export function InstitutionForm({ me }: { me: Me }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [delivery, setDelivery] = useState<Delivery>("email");
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<Created>();

  const set = (key: keyof Form, format?: (v: string) => string) => ({
    value: form[key],
    error: errors[key],
    onChange: (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: format ? format(e.target.value) : e.target.value })),
  });

  function fillMeAsAdmin() {
    setForm((f) => ({ ...f, admin_name: me.full_name, admin_cpf: formatCpf(me.cpf), admin_email: me.email }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError("Revise os campos destacados.");
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setFormError(undefined);
    setLoading(true);

    const res = await callFunctionAsUser<Created>("create-institution", {
      institution: {
        name: form.name,
        legal_name: form.legal_name,
        document: onlyDigits(form.document),
        email: form.email,
        phone: form.phone,
        cep: onlyDigits(form.cep),
        street: form.street,
        number: form.number,
        complement: form.complement,
        district: form.district,
        city: form.city,
        uf: form.uf,
      },
      admin: { full_name: form.admin_name, cpf: onlyDigits(form.admin_cpf), email: form.admin_email },
      delivery,
      redirect_to: `${window.location.origin}/definir-senha`,
    });
    setLoading(false);
    if (!res.ok) {
      setFormError(res.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setCreated(res.data);
    router.refresh();
  }

  if (created) {
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-white p-8">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-7 text-brand-green" aria-hidden />
          <h2 className="text-xl font-bold">Instituição cadastrada</h2>
        </div>
        <p className="text-ink/70">
          {!created.admin.created
            ? "O administrador já tinha conta no MindFocus e foi vinculado à instituição."
            : delivery === "email"
              ? `Enviamos um convite para ${form.admin_email} criar a senha.`
              : delivery === "link"
                ? "Envie o link abaixo ao administrador para ele criar a senha. O link vale por 1 hora."
                : "O administrador pode criar a senha em “Esqueci minha senha”, informando o CPF."}
        </p>
        {created.admin.action_link && <CopyLink url={created.admin.action_link} />}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/instituicoes/${created.institution_id}`}
            className="inline-flex h-11 items-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-blue-dark"
          >
            Ver instituição
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setCreated(undefined);
              setForm(empty);
            }}
          >
            Cadastrar outra
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert tone="error">{formError}</Alert>}

      <Section title="Dados da instituição">
        <Field label="Nome" placeholder="Clínica Exemplo" {...set("name")} className="sm:col-span-2" />
        <Field label="Razão social (opcional)" {...set("legal_name")} className="sm:col-span-2" />
        <Field label="CNPJ ou CPF" inputMode="numeric" placeholder="00.000.000/0000-00" {...set("document", formatDocument)} />
        <Field label="Telefone (opcional)" inputMode="tel" {...set("phone", formatPhone)} />
        <Field label="E-mail (opcional)" type="email" {...set("email")} className="sm:col-span-2" />
      </Section>

      <Section title="Endereço (opcional)">
        <Field label="CEP" inputMode="numeric" placeholder="00000-000" {...set("cep", formatCep)} />
        <div className="hidden sm:block" />
        <Field label="Rua" {...set("street")} className="sm:col-span-2" />
        <Field label="Número" {...set("number")} />
        <Field label="Complemento" {...set("complement")} />
        <Field label="Bairro" {...set("district")} />
        <Field label="Cidade" {...set("city")} />
        <SelectField
          label="UF"
          value={form.uf}
          onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))}
          options={[{ value: "", label: "—" }, ...UFS.map((uf) => ({ value: uf, label: uf }))]}
        />
      </Section>

      <Section
        title="Primeiro administrador"
        description="Quem vai gerenciar a equipe e os pacientes da instituição."
        action={
          <button type="button" onClick={fillMeAsAdmin} className="text-sm font-medium text-brand-blue hover:underline">
            Eu serei o administrador
          </button>
        }
      >
        <Field label="Nome completo" autoComplete="off" {...set("admin_name")} className="sm:col-span-2" />
        <Field label="CPF" inputMode="numeric" placeholder="000.000.000-00" {...set("admin_cpf", formatCpf)} />
        <Field label="E-mail" type="email" autoComplete="off" {...set("admin_email")} />
        <div className="sm:col-span-2">
          <DeliveryChoice value={delivery} onChange={setDelivery} isPlatformAdmin />
        </div>
      </Section>

      <div className="flex justify-end gap-3">
        <Link href="/admin" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold hover:bg-cream">
          Cancelar
        </Link>
        <Button type="submit" loading={loading}>
          Cadastrar instituição
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
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
