"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/br";
import { callFunction } from "@/lib/supabase/client";

export function RecoverForm() {
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState<string>();
  const [result, setResult] = useState<{ tone: "error" | "success"; message: string }>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidCpf(cpf)) {
      setCpfError("Informe um CPF válido.");
      return;
    }
    setCpfError(undefined);
    setLoading(true);
    const res = await callFunction<{ message: string }>("auth-recover-cpf", {
      cpf: onlyDigits(cpf),
      redirect_to: `${window.location.origin}/redefinir-senha`,
    });
    setResult(res.ok ? { tone: "success", message: res.data.message } : { tone: "error", message: res.message });
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && <Alert tone={result.tone}>{result.message}</Alert>}

      <Field
        label="CPF"
        name="cpf"
        inputMode="numeric"
        autoComplete="username"
        placeholder="000.000.000-00"
        value={cpf}
        onChange={(e) => setCpf(formatCpf(e.target.value))}
        error={cpfError}
        autoFocus
      />

      <Button type="submit" loading={loading} className="w-full">
        Enviar link de redefinição
      </Button>

      <Link
        href="/entrar"
        className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-brand-blue hover:text-brand-blue-dark hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar para o login
      </Link>
    </form>
  );
}
