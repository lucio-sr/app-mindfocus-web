"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/br";
import { callFunction, createClient } from "@/lib/supabase/client";

type Session = { access_token: string; refresh_token: string };

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [cpfError, setCpfError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (!isValidCpf(cpf)) {
      setCpfError("Informe um CPF válido.");
      return;
    }
    setCpfError(undefined);
    setLoading(true);

    const result = await callFunction<Session>("auth-login-cpf", { cpf: onlyDigits(cpf), password });
    if (!result.ok) {
      setFormError(result.message);
      setLoading(false);
      return;
    }

    const { error } = await createClient().auth.setSession(result.data);
    if (error) {
      setFormError("Não foi possível iniciar a sessão. Tente de novo.");
      setLoading(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {notice && <Alert tone="success">{notice}</Alert>}
      {formError && <Alert tone="error">{formError}</Alert>}

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

      <div className="flex flex-col gap-2">
        <PasswordField
          label="Senha"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Link
          href="/esqueci-senha"
          className="self-end text-sm font-medium text-brand-blue hover:text-brand-blue-dark hover:underline"
        >
          Esqueci minha senha
        </Link>
      </div>

      <Button type="submit" loading={loading} disabled={!password} className="mt-1 w-full">
        Entrar
      </Button>
    </form>
  );
}
