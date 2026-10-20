import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicQuestionnaire } from "@/components/questionnaire/public-questionnaire";
import { Logo } from "@/components/ui/logo";
import { PageLoading } from "@/components/ui/page-loading";

// no-referrer: o token do link não vaza para outros sites.
export const metadata: Metadata = { title: "Questionário", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Página pública (sem login) aberta pelo link enviado ao responsável.
export default function QuestionnairePage({ params }: PageProps<"/q/[token]">) {
  return (
    <div className="min-h-dvh bg-cream">
      <header className="flex justify-center px-4 pt-8 pb-4">
        <Logo size={40} />
      </header>
      <main className="mx-auto w-full max-w-xl px-4 pb-16">
        <Suspense fallback={<PageLoading />}>
          <WithToken params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function WithToken({ params }: Pick<PageProps<"/q/[token]">, "params">) {
  const { token } = await params;
  return <PublicQuestionnaire token={token} />;
}
