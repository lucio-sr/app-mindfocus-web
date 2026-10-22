"use client";

import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export type ReportSettingsInput = {
  subtitle: string;
  cover_text: string;
  intro_text: string;
  study_description: string;
  procedures_text: string;
  ethics_statement: string;
  closing_notes: string;
  references_url: string;
  location: string;
};

const MAX_LOGO = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg"];
const BUCKET = "institution-logos";

// Textos e logos usados no relatório e na devolutiva. Só o admin da instituição edita.
export function ReportSettingsForm({
  institutionId,
  initial,
  logoPath,
  partnerPaths,
  canEdit,
}: {
  institutionId: string;
  initial: ReportSettingsInput;
  logoPath: string | null;
  partnerPaths: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [result, setResult] = useState<{ tone: "error" | "success"; message: string }>();
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const paths = [logoPath, ...partnerPaths].filter((p): p is string => Boolean(p));
  const key = paths.join("|");
  useEffect(() => {
    if (!key) return;
    createClient()
      .storage.from(BUCKET)
      .createSignedUrls(key.split("|"), 300)
      .then(({ data }) => {
        const entries = (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : []));
        setPreviews(Object.fromEntries(entries));
      });
  }, [key]);

  const bind = (k: keyof ReportSettingsInput) => ({
    value: form[k],
    disabled: !canEdit,
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const url = form.references_url.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) {
      setResult({ tone: "error", message: "O link das referências precisa começar com https://." });
      return;
    }
    setLoading(true);
    const clean = (v: string) => v.trim() || null;
    const { error } = await createClient()
      .from("institution_report_settings")
      .upsert({
        institution_id: institutionId,
        subtitle: clean(form.subtitle),
        cover_text: clean(form.cover_text),
        intro_text: clean(form.intro_text),
        study_description: clean(form.study_description),
        procedures_text: clean(form.procedures_text),
        ethics_statement: clean(form.ethics_statement),
        closing_notes: form.closing_notes.split("\n").map((l) => l.trim()).filter(Boolean),
        references_url: url || null,
        location: clean(form.location),
      });
    setLoading(false);
    setResult(error ? { tone: "error", message: "Não foi possível salvar." } : { tone: "success", message: "Textos salvos." });
    if (!error) router.refresh();
  }

  async function upload(file: File, kind: "logo" | "partner") {
    if (!LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO) {
      setResult({ tone: "error", message: "Use uma imagem PNG ou JPG de até 2 MB." });
      return;
    }
    const supabase = createClient();
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = kind === "logo" ? `${institutionId}/logo-${crypto.randomUUID()}.${ext}` : `${institutionId}/parceiros/${crypto.randomUUID()}.${ext}`;
    const { error: upError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (upError) return setResult({ tone: "error", message: "Não foi possível enviar a imagem." });
    const { error } =
      kind === "logo"
        ? await supabase.from("institutions").update({ logo_path: path }).eq("id", institutionId)
        : await supabase.from("institution_report_settings").upsert({ institution_id: institutionId, partner_logo_paths: [...partnerPaths, path] });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      return setResult({ tone: "error", message: "Não foi possível salvar a imagem." });
    }
    if (kind === "logo" && logoPath) await supabase.storage.from(BUCKET).remove([logoPath]);
    setResult({ tone: "success", message: "Imagem salva." });
    router.refresh();
  }

  async function removeImage(path: string) {
    const supabase = createClient();
    const { error } =
      path === logoPath
        ? await supabase.from("institutions").update({ logo_path: null }).eq("id", institutionId)
        : await supabase
            .from("institution_report_settings")
            .update({ partner_logo_paths: partnerPaths.filter((p) => p !== path) })
            .eq("institution_id", institutionId);
    if (error) return setResult({ tone: "error", message: "Não foi possível remover a imagem." });
    await supabase.storage.from(BUCKET).remove([path]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <Section title="Logos" hint="PNG ou JPG, até 2 MB. O logo da instituição vai à esquerda do cabeçalho; os de parceiros, à direita.">
        <div className="flex flex-wrap items-end gap-6">
          <LogoSlot label="Instituição" path={logoPath} preview={logoPath ? previews[logoPath] : undefined} canEdit={canEdit} onPick={(f) => upload(f, "logo")} onRemove={removeImage} />
          {partnerPaths.map((p, i) => (
            <LogoSlot key={p} label={`Parceiro ${i + 1}`} path={p} preview={previews[p]} canEdit={canEdit} onRemove={removeImage} />
          ))}
          {canEdit && partnerPaths.length < 4 && <LogoSlot label="Novo parceiro" path={null} canEdit onPick={(f) => upload(f, "partner")} onRemove={removeImage} />}
        </div>
      </Section>

      <Section title="Capa do relatório">
        <Field label="Subtítulo" placeholder="Ex.: Pesquisa Clínica em Neuropsicologia Infantil" {...bind("subtitle")} />
        <Area label="Texto do quadro da capa" rows={3} {...bind("cover_text")} />
        <Field label="Local" hint="Em branco: cidade - UF da instituição." {...bind("location")} />
      </Section>

      <Section title="Devolutiva" hint="Seções em branco não aparecem. Parágrafos separados por linha em branco; **negrito** é aceito.">
        <Area label="Parágrafo de abertura" rows={4} {...bind("intro_text")} />
        <Area label="Descrição do estudo" rows={8} {...bind("study_description")} />
        <Area label="Procedimentos" rows={5} {...bind("procedures_text")} />
        <Area label="Declaração ética e de responsabilidade" rows={4} {...bind("ethics_statement")} />
        <Area label="“Importante ressaltar que este documento” (um item por linha)" rows={4} {...bind("closing_notes")} />
        <Field label="Link das referências bibliográficas" placeholder="https://…" hint="Vira um QR code no fim da devolutiva." {...bind("references_url")} />
      </Section>

      {result && <Alert tone={result.tone}>{result.message}</Alert>}
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" loading={loading}>
            Salvar textos
          </Button>
        </div>
      )}
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="text-sm text-ink/60">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Area({ label, rows, value, disabled, onChange }: { label: string; rows: number; value: string; disabled: boolean; onChange: (e: { target: { value: string } }) => void }) {
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={onChange}
        className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-[15px] focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/15 focus:outline-none disabled:bg-ink/5"
      />
    </div>
  );
}

function LogoSlot({
  label,
  path,
  preview,
  canEdit,
  onPick,
  onRemove,
}: {
  label: string;
  path: string | null;
  preview?: string;
  canEdit: boolean;
  onPick?: (file: File) => void;
  onRemove: (path: string) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex h-20 w-36 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink/20 bg-white p-2">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do bucket privado
          <img src={preview} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImagePlus className="size-6 text-ink/30" aria-hidden />
        )}
      </div>
      {canEdit && (
        <span className="flex gap-3 text-sm">
          {onPick && (
            <label className="cursor-pointer font-medium text-brand-blue hover:underline">
              {path ? "Trocar" : "Enviar"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onPick(file);
                }}
              />
            </label>
          )}
          {path && (
            <button type="button" onClick={() => onRemove(path)} className="inline-flex items-center gap-1 text-ink/55 hover:text-red-700">
              <Trash2 className="size-3.5" aria-hidden /> Remover
            </button>
          )}
        </span>
      )}
    </div>
  );
}
