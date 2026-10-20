import { Building2, ClipboardList, Gamepad2, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { formatDate, statusLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Instituições" };

const newButton = (
  <LinkButton href="/admin/instituicoes/nova">
    <Plus className="size-4" aria-hidden /> Nova instituição
  </LinkButton>
);

export default function AdminHomePage() {
  return (
    <>
      <PageHeader
        title="Instituições"
        description="Clínicas, escolas e consultórios que usam o MindFocus. Números agregados, sem dados de pacientes."
        actions={newButton}
      />
      <Suspense fallback={<PageLoading />}>
        <InstitutionsOverview />
      </Suspense>
    </>
  );
}

async function InstitutionsOverview() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_institution_stats");
  const rows = data ?? [];
  const total = (key: "patients" | "game_sessions" | "members") => rows.reduce((sum, r) => sum + Number(r[key]), 0);

  return (
    <>
      {error && <p className="text-red-700">Não foi possível carregar as instituições.</p>}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-6" aria-hidden />}
          title="Nenhuma instituição cadastrada"
          description="Cadastre a primeira instituição e o administrador dela. Comece pela própria MindFocus."
        />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Instituições" value={rows.length} icon={<Building2 className="size-5" />} />
            <StatCard label="Colaboradores" value={total("members")} icon={<UsersRound className="size-5" />} tone="green" />
            <StatCard label="Pacientes" value={total("patients")} icon={<ClipboardList className="size-5" />} tone="sand" />
            <StatCard label="Sessões de jogo" value={total("game_sessions")} icon={<Gamepad2 className="size-5" />} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-ink/50">
                <tr>
                  <th className="px-6 py-3 font-semibold">Instituição</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 text-right font-semibold">Colaboradores</th>
                  <th className="px-4 py-3 text-right font-semibold">Pacientes</th>
                  <th className="px-4 py-3 text-right font-semibold">Sessões</th>
                  <th className="px-4 py-3 text-right font-semibold">Laudos</th>
                  <th className="px-6 py-3 font-semibold">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {rows.map((r) => (
                  <tr key={r.institution_id} className="hover:bg-cream/40">
                    <td className="px-6 py-4">
                      <Link href={`/admin/instituicoes/${r.institution_id}`} className="font-semibold text-ink hover:text-brand-blue">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={statusLabel[r.status].tone}>{statusLabel[r.status].label}</Badge>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">{r.members}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{r.patients}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{r.game_sessions}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{r.reports}</td>
                    <td className="px-6 py-4 text-ink/60">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
