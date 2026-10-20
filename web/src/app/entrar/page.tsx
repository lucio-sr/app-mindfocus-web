import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar" };

// Só aceita destinos internos (evita redirecionamento para outro site).
function safeNext(value: string | string[] | undefined): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/inicio";
}

export default function LoginPage({ searchParams }: PageProps<"/entrar">) {
  return (
    <AuthShell title="Entrar" subtitle="Acesse com o seu CPF e senha.">
      <Suspense fallback={<LoginForm next="/inicio" />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginFormWithParams({ searchParams }: Pick<PageProps<"/entrar">, "searchParams">) {
  const params = await searchParams;
  const notice = params.saiu === "1" ? "Você saiu da sua conta." : undefined;
  return <LoginForm next={safeNext(params.next)} notice={notice} />;
}
