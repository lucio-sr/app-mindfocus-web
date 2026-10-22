import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getCurrentInstitution } from "@/lib/access";
import { AI_MODEL, AiUnavailableError, writeGeneral, writeSummary } from "@/lib/reports/ai";
import { loadReportData } from "@/lib/reports/data";
import { GeneralPdf, SummaryPdf } from "@/lib/reports/pdf";
import { createClient } from "@/lib/supabase/server";

// POST {kind: "summary" | "general", notes?} → gera o PDF, guarda em reports/{inst}/{paciente}/{id}.pdf
// e registra em public.reports. Só admin e psicólogo (RLS de reports e do bucket).
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLES = { summary: "Relatório", general: "Devolutiva" } as const;

const error = (status: number, message: string) => Response.json({ error: message }, { status });

export async function POST(request: Request, ctx: RouteContext<"/api/pacientes/[id]/relatorios">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return error(404, "Paciente não encontrado.");

  const body = (await request.json().catch(() => null)) as { kind?: string; notes?: unknown } | null;
  const kind = body?.kind === "summary" || body?.kind === "general" ? body.kind : null;
  if (!kind) return error(400, "Tipo de documento inválido.");
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 4000) : null;

  const current = await getCurrentInstitution();
  if (!current) return error(401, "Sessão expirada. Entre de novo.");
  if (current.role !== "admin" && current.role !== "psychologist") return error(403, "Só psicólogos e administradores geram documentos.");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return error(401, "Sessão expirada. Entre de novo.");

  const d = await loadReportData(supabase, current.institution_id, id, userId);
  if (!d) return error(404, "Paciente não encontrado.");
  if (kind === "summary" && !d.session) return error(422, "O relatório usa o jogo: este paciente ainda não tem sessão de jogo com resultados.");

  const origin = new URL(request.url).origin;
  const [mascot, qr] = await Promise.all([
    fetch(`${origin}/brand/mascote.png`)
      .then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null))
      .catch(() => null),
    d.settings?.references_url ? QRCode.toBuffer(d.settings.references_url, { width: 400, margin: 1, color: { dark: "#233A5C" } }) : null,
  ]);

  let pdf: Buffer;
  try {
    const assets = { mascot, qr };
    pdf =
      kind === "summary"
        ? await renderToBuffer(SummaryPdf({ d, text: await writeSummary(d), notes, assets }))
        : await renderToBuffer(GeneralPdf({ d, text: await writeGeneral(d), notes, assets }));
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      console.error("relatorio: IA indisponível:", e.message);
      return error(503, "A redação automática está indisponível no momento. Tente de novo em alguns minutos.");
    }
    console.error("relatorio: falha ao gerar o PDF", e);
    return error(500, "Não foi possível gerar o PDF.");
  }

  const reportId = crypto.randomUUID();
  const path = `${current.institution_id}/${id}/${reportId}.pdf`;
  const upload = await supabase.storage.from("reports").upload(path, pdf, { contentType: "application/pdf" });
  if (upload.error) return error(403, "Sem permissão para guardar o documento.");

  const { error: insertError } = await supabase.from("reports").insert({
    id: reportId,
    institution_id: current.institution_id,
    patient_id: id,
    kind,
    title: TITLES[kind],
    storage_path: path,
    notes,
    ai_model: AI_MODEL,
    session_id: d.session?.id ?? null,
  });
  if (insertError) {
    await supabase.storage.from("reports").remove([path]);
    return error(403, "Sem permissão para registrar o documento.");
  }

  return Response.json({ id: reportId });
}
