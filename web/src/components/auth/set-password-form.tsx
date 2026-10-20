"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

// Regras do Auth (config.toml): mínimo de 8 caracteres, com letras e números.
const rules = [
  { label: "Pelo menos 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Letras e números", test: (p: string) => /[a-zA-Z]/.test(p) && /\d/.test(p) },
];

type LinkState = "checking" | "ready" | "invalid";

// Destino dos links de convite (/definir-senha) e de recuperação (/redefinir-senha).
// O link do Auth chega de três jeitos: #access_token=... (implícito), ?code=... (PKCE) ou
// ?token_hash=...&type=... (template de e-mail customizado). Os três viram uma sessão aqui.
let pending: Promise<boolean> | null = null; // evita processar o link duas vezes (StrictMode)

function sessionFromUrl(): Promise<boolean> {
  pending ??= readSessionFromUrl();
  return pending;
}

async function readSessionFromUrl(): Promise<boolean> {
  const supabase = createClient();
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const clean = () => window.history.replaceState(null, "", url.pathname);

  if (hash.get("error") || url.searchParams.get("error")) {
    clean();
    return false;
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    clean();
    return !error;
  }

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    clean();
    return !error;
  }

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && (type === "invite" || type === "recovery")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    clean();
    return !error;
  }

  // Sem token na URL: vale a sessão já aberta (ex.: recarregou a página).
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

export function SetPasswordForm({ mode }: { mode: "invite" | "recovery" }) {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    sessionFromUrl().then((ok) => setLinkState(ok ? "ready" : "invalid"));
  }, []);

  const valid = rules.every((r) => r.test(password));
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || password !== confirm) return;
    setFormError(undefined);
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setFormError(
        error.code === "same_password"
          ? "A nova senha precisa ser diferente da anterior."
          : error.code === "weak_password"
            ? "Senha fraca. Use pelo menos 8 caracteres, com letras e números."
            : "Não foi possível salvar a senha. Tente de novo.",
      );
      setLoading(false);
      return;
    }
    router.replace("/inicio");
    router.refresh();
  }

  if (linkState === "checking") {
    return (
      <p className="flex items-center gap-2 text-ink/70">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Validando o link…
      </p>
    );
  }

  if (linkState === "invalid") {
    return (
      <div className="flex flex-col gap-5">
        <Alert tone="error">
          Este link é inválido ou expirou.{" "}
          {mode === "invite"
            ? "Peça um novo convite à sua instituição, ou use “Esqueci minha senha” com o seu CPF."
            : "Peça um novo link de redefinição."}
        </Alert>
        <Link
          href="/esqueci-senha"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-blue-dark"
        >
          Pedir novo link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError && <Alert tone="error">{formError}</Alert>}

      <PasswordField
        label="Nova senha"
        name="new-password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      <ul className="-mt-2 space-y-1 text-sm">
        {rules.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.label} className={`flex items-center gap-2 ${ok ? "text-brand-green-dark" : "text-ink/60"}`}>
              <Check className={`size-4 ${ok ? "" : "opacity-30"}`} aria-hidden />
              {r.label}
            </li>
          );
        })}
      </ul>

      <PasswordField
        label="Confirme a nova senha"
        name="confirm-password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? "As senhas não coincidem." : undefined}
      />

      <Button type="submit" loading={loading} disabled={!valid || password !== confirm} className="w-full">
        {mode === "invite" ? "Criar senha e entrar" : "Salvar nova senha"}
      </Button>
    </form>
  );
}
