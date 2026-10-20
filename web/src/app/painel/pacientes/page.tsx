import Link from "next/link";
import { ChevronRight, UserPlus, UsersRound } from "lucide-react";
import { Suspense } from "react";
import { PatientSearch } from "@/components/patients/patient-search";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getCurrentInstitution } from "@/lib/access";
import { formatCpf, onlyDigits } from "@/lib/br";
import { ageFrom, formatDate } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pacientes" };

const PAGE_SIZE = 25;

const newButton = (
  <LinkButton href="/painel/pacientes/novo">
    <UserPlus className="size-4" aria-hidden /> Novo paciente
  </LinkButton>
);

export default function PatientsPage({ searchParams }: PageProps<"/painel/pacientes">) {
  return (
    <>
      <PageHeader title="Pacientes" description="Crianças e adolescentes acompanhados pela instituição." actions={newButton} />
      <Suspense fallback={<PageLoading />}>
        <PatientList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Row = {
  id: string;
  full_name: string;
  birthdate: string;
  cpf: string | null;
  created_at: string;
  guardians: { relationship: string; guardian: { full_name: string } | null }[];
  sessions: { started_at: string | null; created_at: string }[];
};

async function PatientList({ searchParams }: Pick<PageProps<"/painel/pacientes">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.pagina) || 1);
  const current = await getCurrentInstitution();
  const supabase = await createClient();

  let query = supabase
    .from("patients")
    .select(
      `id, full_name, birthdate, cpf, created_at,
       guardians:patient_guardians(relationship, guardian:profiles(full_name)),
       sessions:game_sessions(started_at, created_at)`,
      { count: "exact" },
    )
    .eq("institution_id", current!.institution_id)
    .order("full_name")
    .order("created_at", { referencedTable: "game_sessions", ascending: false })
    .limit(1, { referencedTable: "game_sessions" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Só letras, números e espaços entram no filtro (evita quebrar a sintaxe do PostgREST).
  const name = q.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const digits = onlyDigits(q);
  if (digits.length >= 3 && digits.length === q.replace(/[.\-\s]/g, "").length) query = query.like("cpf", `%${digits}%`);
  else if (name) query = query.ilike("full_name", `%${name}%`);

  const { data, count, error } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PatientSearch initial={q} />
        <p className="text-sm text-ink/60">
          {total} {total === 1 ? "paciente" : "pacientes"}
          {q && " encontrados"}
        </p>
      </div>

      {error && <p className="mb-4 text-red-700">Não foi possível carregar os pacientes.</p>}

      {rows.length === 0 ? (
        q ? (
          <EmptyState icon={<UsersRound className="size-6" />} title="Nenhum paciente encontrado" description={`Nada corresponde a “${q}”.`} />
        ) : (
          <EmptyState
            icon={<UsersRound className="size-6" />}
            title="Nenhum paciente cadastrado"
            description="Cadastre o primeiro paciente junto com o responsável. Depois é só gerar o PIN para ele jogar."
            action={newButton}
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-ink/50">
              <tr>
                <th className="px-6 py-3 font-semibold">Paciente</th>
                <th className="px-4 py-3 font-semibold">Idade</th>
                <th className="px-4 py-3 font-semibold">Responsáveis</th>
                <th className="px-4 py-3 font-semibold">Última sessão</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {rows.map((p) => {
                const last = p.sessions[0];
                return (
                  <tr key={p.id} className="group relative hover:bg-cream/40">
                    <td className="px-6 py-4">
                      <Link href={`/painel/pacientes/${p.id}`} className="font-semibold text-ink after:absolute after:inset-0 group-hover:text-brand-blue">
                        {p.full_name}
                      </Link>
                      <p className="text-xs text-ink/55">
                        {p.cpf ? `CPF ${formatCpf(p.cpf)}` : "Sem CPF"} · nasc. {formatDate(p.birthdate)}
                      </p>
                    </td>
                    <td className="px-4 py-4 tabular-nums">{ageFrom(p.birthdate)} anos</td>
                    <td className="px-4 py-4 text-ink/75">
                      {p.guardians.length === 0
                        ? "—"
                        : p.guardians.map((g) => `${g.guardian?.full_name ?? "—"} (${g.relationship})`).join(", ")}
                    </td>
                    <td className="px-4 py-4 text-ink/75">{last ? formatDate(last.started_at ?? last.created_at) : "Nenhuma"}</td>
                    <td className="pr-4 text-ink/30 group-hover:text-brand-blue">
                      <ChevronRight className="size-4" aria-hidden />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Paginação">
          {page > 1 && (
            <Link className="rounded-lg px-3 py-2 hover:bg-cream" href={`?${new URLSearchParams({ ...(q && { q }), pagina: String(page - 1) })}`}>
              Anterior
            </Link>
          )}
          <span className="px-2 text-ink/60">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <Link className="rounded-lg px-3 py-2 hover:bg-cream" href={`?${new URLSearchParams({ ...(q && { q }), pagina: String(page + 1) })}`}>
              Próxima
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
