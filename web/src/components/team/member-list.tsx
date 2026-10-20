"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCpf } from "@/lib/br";
import { formatDate, roleLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type { Member } from "@/lib/team";

const roleTone = { admin: "blue", psychologist: "green", staff: "gray" } as const;

// Lista de colaboradores. Quem pode gerenciar (admin da instituição ou superadmin) muda papel e
// desliga/religa. O banco impede deixar a instituição sem nenhum admin ativo.
export function MemberList({
  institutionId,
  members,
  canManage,
  currentUserId,
}: {
  institutionId: string;
  members: Member[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function update(userId: string, patch: { active?: boolean; role?: Member["role"] }) {
    setBusy(userId);
    setError(undefined);
    const { error } = await createClient()
      .from("institution_members")
      .update(patch)
      .eq("institution_id", institutionId)
      .eq("user_id", userId);
    setBusy(undefined);
    if (error) {
      setError(
        error.code === "23514"
          ? "A instituição precisa manter ao menos um administrador ativo."
          : "Não foi possível salvar a alteração.",
      );
      return;
    }
    router.refresh();
  }

  if (members.length === 0) return <p className="text-sm text-ink/60">Nenhum colaborador.</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-ink/8">
        {members.map((m) => (
          <li key={m.user_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 ${m.active ? "" : "opacity-55"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {m.profile?.full_name ?? "—"}
                {m.user_id === currentUserId && <span className="ml-2 text-xs font-normal text-ink/50">(você)</span>}
              </p>
              <p className="truncate text-sm text-ink/60">
                {m.profile?.email} · CPF {m.profile ? formatCpf(m.profile.cpf) : "—"} · desde {formatDate(m.created_at)}
              </p>
            </div>
            {canManage ? (
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                  Papel
                </label>
                <select
                  id={`role-${m.user_id}`}
                  value={m.role}
                  disabled={busy === m.user_id || !m.active}
                  onChange={(e) => update(m.user_id, { role: e.target.value as Member["role"] })}
                  className="h-9 rounded-lg border border-ink/15 bg-white px-2 text-sm"
                >
                  {Object.entries(roleLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy === m.user_id}
                  onClick={() => update(m.user_id, { active: !m.active })}
                  className="h-9 rounded-lg px-3 text-sm font-medium text-ink/70 hover:bg-cream hover:text-ink disabled:opacity-50"
                >
                  {m.active ? "Desligar" : "Religar"}
                </button>
              </div>
            ) : (
              <Badge tone={roleTone[m.role]}>{roleLabel[m.role]}</Badge>
            )}
            {!m.active && <Badge tone="gray">Desligado(a)</Badge>}
          </li>
        ))}
      </ul>
    </div>
  );
}
