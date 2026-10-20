import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata: Metadata = { title: "Criar senha" };

export default function InvitePage() {
  return (
    <AuthShell title="Boas-vindas!" subtitle="Crie a sua senha para acessar o MindFocus.">
      <SetPasswordForm mode="invite" />
    </AuthShell>
  );
}
