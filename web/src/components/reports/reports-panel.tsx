"use client";

import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";

export type ReportItem = { id: string; kind: "summary" | "general"; title: string | null; created_at: string; storage_path: string; author: string | null };

const KINDS = {
  summary: { label: "Relatório", hint: "Jogo, histórico e SNAP-IV, com texto redigido automaticamente. Exige uma sessão de jogo." },
  general: { label: "Devolutiva", hint: "Testes neuropsicológicos (TAVIS, FDT, NEUPSILIN-Inf), jogo e textos da pesquisa da instituição." },
} as const;

// Quadro da ficha: gerar relatório/devolutiva (admin e psicólogo) e baixar os já gerados.
export function ReportsPanel({
  patientId,
  reports,
  canGenerate,
  canDelete,
  hasSession,
}: {
  patientId: string;
  reports: ReportItem[];
  canGenerate: boolean;
  canDelete: boolean;
  hasSession: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"summary" | "general" | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const [done, setDone] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();

  // URL assinada de curta duração (bucket privado), baixada com o nome do documento.
  async function download(r: Pick<ReportItem, "storage_path" | "title" | "created_at">) {
    const name = `${r.title ?? "Documento"} ${r.created_at.slice(0, 10)}.pdf`;
    const { data } = await createClient().storage.from("reports").createSignedUrl(r.storage_path, 60, { download: name });
    if (data?.signedUrl) window.location.assign(data.signedUrl);
    else setError("Não foi possível baixar o documento.");
  }

  async function generate() {
    if (!kind) return;
    setLoading(true);
    setError(undefined);
    setDone(undefined);
    const res = await fetch(`/api/pacientes/${patientId}/relatorios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, notes }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (!res?.ok) return setError(body.error ?? "Não foi possível gerar o documento.");
    setDone(`${KINDS[kind].label} gerado. Ele está na lista abaixo.`);
    setKind(null);
    setNotes("");
    router.refresh();
  }

  async function remove(r: ReportItem) {
    setConfirmDelete(undefined);
    const supabase = createClient();
    await supabase.storage.from("reports").remove([r.storage_path]);
    const { error } = await supabase.from("reports").delete().eq("id", r.id);
    if (error) setError("Não foi possível excluir.");
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {canGenerate && !kind && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => (
            <Button
              key={k}
              variant={k === "summary" ? "primary" : "secondary"}
              className="h-9 px-3"
              disabled={k === "summary" && !hasSession}
              title={k === "summary" && !hasSession ? "Precisa de uma sessão de jogo" : undefined}
              onClick={() => {
                setKind(k);
                setError(undefined);
              }}
            >
              <FileText className="size-4" aria-hidden /> Gerar {KINDS[k].label.toLowerCase()}
            </Button>
          ))}
        </div>
      )}

      {kind && (
        <div className="flex flex-col gap-3 rounded-xl bg-brand-blue/5 p-4">
          <p className="text-sm">
            <strong>{KINDS[kind].label}.</strong> {KINDS[kind].hint}
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-notes" className="text-sm font-medium">
              Notas do profissional (opcional)
            </label>
            <textarea
              id="report-notes"
              rows={3}
              value={notes}
              maxLength={4000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Entram no fim do documento, com esse título."
              className="rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-[15px] focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/15 focus:outline-none"
            />
          </div>
          {loading && (
            <p className="flex items-center gap-2 text-sm text-ink/65">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Redigindo e montando o PDF. Pode levar até 1 minuto.
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={generate} loading={loading}>
              Gerar PDF
            </Button>
            <Button variant="ghost" onClick={() => setKind(null)} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}

      {reports.length === 0 ? (
        <p className="text-sm text-ink/60">Nenhum documento gerado ainda.</p>
      ) : (
        <ul className="-my-1 divide-y divide-ink/8">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <Badge tone={r.kind === "summary" ? "blue" : "green"}>{r.title ?? KINDS[r.kind].label}</Badge>
              <span className="flex-1 text-sm">
                {formatDateTime(r.created_at)}
                {r.author && <span className="text-ink/55"> · {r.author}</span>}
              </span>
              <button type="button" onClick={() => download(r)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline">
                <Download className="size-4" aria-hidden /> Baixar
              </button>
              {canDelete &&
                (confirmDelete === r.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={() => remove(r)} className="font-semibold text-red-700 hover:underline">
                      Excluir
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(undefined)} className="text-ink/60 hover:underline">
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(r.id)} className="text-ink/40 hover:text-red-700" aria-label="Excluir documento">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
