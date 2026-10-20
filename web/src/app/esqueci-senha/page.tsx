import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoverForm } from "@/components/auth/recover-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function RecoverPage() {
  return (
    <AuthShell
      title="Esqueci minha senha"
      subtitle="Informe o seu CPF. Enviaremos um link para criar uma nova senha no e-mail do cadastro."
    >
      <RecoverForm />
    </AuthShell>
  );
}
