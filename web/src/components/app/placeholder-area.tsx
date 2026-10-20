import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/app/sign-out-button";
import { getAccess } from "@/lib/access";

const roleLabel = { admin: "Administrador(a)", psychologist: "Psicólogo(a)", staff: "Colaborador(a)" };

// Área provisória: confirma o login e o perfil até as telas reais (mockup) serem portadas.
// Cabeçalho estático; o que depende da sessão chega por streaming dentro do <Suspense>.
export function PlaceholderArea({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-dvh bg-cream/40">
      <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-3">
        <Logo size={36} />
        <SignOutButton />
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Suspense
          fallback={
            <p className="flex items-center gap-2 text-ink/70">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
            </p>
          }
        >
          <UserSummary title={title} description={description} />
        </Suspense>
      </main>
    </div>
  );
}

async function UserSummary({ title, description }: { title: string; description: string }) {
  const access = await getAccess();
  if (!access) redirect("/entrar");

  return (
    <>
      <h1 className="text-3xl font-extrabold">Olá, {access.full_name.split(" ")[0]}!</h1>
      <p className="mt-2 text-ink/70">{description}</p>

      <section className="mt-8 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <dt className="w-40 text-ink/60">Nome</dt>
            <dd>{access.full_name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 text-ink/60">E-mail</dt>
            <dd>{access.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 text-ink/60">Superadmin</dt>
            <dd>{access.is_platform_admin ? "Sim" : "Não"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 text-ink/60">Instituições</dt>
            <dd>
              {access.memberships.length === 0
                ? "Nenhuma"
                : access.memberships.map((m) => `${m.institution_name} (${roleLabel[m.role]})`).join(", ")}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
