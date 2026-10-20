"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Link2, MessageCircle, Tablet } from "lucide-react";
import { useState } from "react";
import { CopyLink } from "@/components/app/copy-link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/labels";
import { channelLabel, SNAP_CUTOFF, SNAP_SUBSCALES, type SnapScores } from "@/lib/snap-iv";
import { createClient } from "@/lib/supabase/client";

export type SnapGuardian = { id: string; name: string; relationship: string };
export type SnapResponse = { id: string; ended_at: string | null; created_at: string; channel: string | null; guardian: string | null; scores: SnapScores | null };
export type SnapRequest = { id: string; guardian: string; expires_at: string; created_at: string };

// Quadro do SNAP-IV na ficha: enviar link, aplicar no consultório, pedidos pendentes e resultados.
export function SnapIvPanel({
  patientId,
  firstName,
  guardians,
  responses,
  requests,
}: {
  patientId: string;
  firstName: string;
  guardians: SnapGuardian[];
  responses: SnapResponse[];
  requests: SnapRequest[];
}) {
  const router = useRouter();
  const [guardianId, setGuardianId] = useState(guardians[0]?.id ?? "");
  const [link, setLink] = useState<{ url: string; expires: string; name: string }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const guardian = guardians.find((g) => g.id === guardianId);

  async function sendLink() {
    if (!guardian) return;
    setLoading(true);
    setError(undefined);
    const { data, error } = await createClient().rpc("create_questionnaire_request", { p_patient_id: patientId, p_guardian_id: guardianId });
    setLoading(false);
    if (error || !data?.[0]) return setError("Não foi possível gerar o link.");
    setLink({ url: `${window.location.origin}/q/${data[0].token}`, expires: data[0].expires_at, name: guardian.name.split(" ")[0] });
    router.refresh();
  }

  async function revoke(id: string) {
    const { error } = await createClient().rpc("revoke_questionnaire_request", { p_request_id: id });
    if (error) setError("Não foi possível cancelar o pedido.");
    else router.refresh();
  }

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(
        `Olá, ${link.name}! Pedimos que responda um questionário curto sobre ${firstName} (cerca de 5 minutos): ${link.url}`,
      )}`
    : "";

  return (
    <div className="flex flex-col gap-5">
      {guardians.length === 0 ? (
        <p className="text-sm text-ink/60">Inclua um responsável no paciente para aplicar o SNAP-IV.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {guardians.length > 1 && (
              <>
                <label htmlFor="snap-guardian" className="text-sm text-ink/65">
                  Respondente
                </label>
                <select
                  id="snap-guardian"
                  value={guardianId}
                  onChange={(e) => {
                    setGuardianId(e.target.value);
                    setLink(undefined);
                  }}
                  className="h-9 rounded-lg border border-ink/15 bg-white px-2 text-sm"
                >
                  {guardians.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.relationship})
                    </option>
                  ))}
                </select>
              </>
            )}
            <Button onClick={sendLink} loading={loading} className="h-9 px-3">
              <Link2 className="size-4" aria-hidden /> {guardians.length > 1 ? "Gerar link" : `Gerar link para ${guardian?.name.split(" ")[0]}`}
            </Button>
            <Link
              href={`/painel/pacientes/${patientId}/snap-iv/aplicar?responsavel=${guardianId}`}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3 text-sm font-semibold hover:bg-cream"
            >
              <Tablet className="size-4" aria-hidden /> Aplicar agora
            </Link>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          {link && (
            <div className="flex flex-col gap-2 rounded-xl bg-brand-blue/5 p-4">
              <p className="text-sm">
                Envie este link para <strong>{link.name}</strong>. Vale uma vez, até {formatDateTime(link.expires)}; para abrir, é preciso
                informar a data de nascimento de {firstName}.
              </p>
              <CopyLink url={link.url} />
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 self-start text-sm font-semibold text-brand-green-dark hover:underline"
              >
                <MessageCircle className="size-4" aria-hidden /> Enviar pelo WhatsApp
              </a>
            </div>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/45">Aguardando resposta</p>
          <ul className="flex flex-col gap-2 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span>
                  {r.guardian} · enviado em {formatDate(r.created_at)} · vale até {formatDate(r.expires_at)}
                </span>
                <button type="button" onClick={() => revoke(r.id)} className="text-sm font-medium text-red-700 hover:underline">
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {responses.length === 0 ? (
        <p className="text-sm text-ink/60">Nenhuma resposta ainda.</p>
      ) : (
        <ul className="-my-1 divide-y divide-ink/8">
          {responses.map((r) => (
            <li key={r.id}>
              <Link href={`/painel/pacientes/${patientId}/snap-iv/${r.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-40 flex-1 text-sm">
                  <span className="font-medium">{formatDate(r.ended_at ?? r.created_at)}</span>
                  <span className="text-ink/55">
                    {" "}
                    · {r.guardian ?? "responsável removido"} · {channelLabel[r.channel ?? ""] ?? ""}
                  </span>
                </span>
                {r.scores &&
                  SNAP_SUBSCALES.map((s) => {
                    const count = r.scores![s.key].count;
                    return (
                      <Badge key={s.key} tone={count >= SNAP_CUTOFF ? "sand" : "gray"}>
                        {s.label.split("/")[0]}: {count}/9
                      </Badge>
                    );
                  })}
                <ChevronRight className="size-4 text-ink/30 group-hover:text-brand-blue" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
