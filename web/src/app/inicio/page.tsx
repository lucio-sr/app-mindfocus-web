import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAccess } from "@/lib/access";
import { homeFor } from "@/lib/supabase/server";

// Depois do login: manda cada perfil para a sua área.
export default function StartPage() {
  return (
    <Suspense fallback={<p className="p-8 text-ink/70">Carregando…</p>}>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<null> {
  redirect(homeFor(await getAccess()));
}
