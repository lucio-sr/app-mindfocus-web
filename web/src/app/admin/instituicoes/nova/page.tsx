import { Suspense } from "react";
import { InstitutionForm } from "@/components/admin/institution-form";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Nova instituição" };

export default function NewInstitutionPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nova instituição"
        description="Cadastre a instituição e o primeiro administrador. Depois ele convida o restante da equipe."
        back={{ href: "/admin", label: "Instituições" }}
      />
      <Suspense fallback={<PageLoading />}>
        <FormWithMe />
      </Suspense>
    </div>
  );
}

// Dados do superadmin para o atalho "Eu serei o administrador".
async function FormWithMe() {
  const access = await getAccess();
  const supabase = await createClient();
  const { data: me } = await supabase.from("profiles").select("full_name, cpf, email").eq("id", access!.user_id).single();
  return <InstitutionForm me={me ?? { full_name: "", cpf: "", email: "" }} />;
}
