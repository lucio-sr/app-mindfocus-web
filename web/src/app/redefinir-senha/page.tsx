import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default function ResetPage() {
  return (
    <AuthShell title="Nova senha" subtitle="Escolha uma nova senha para a sua conta.">
      <SetPasswordForm mode="recovery" />
    </AuthShell>
  );
}
