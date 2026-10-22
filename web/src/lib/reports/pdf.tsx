/* eslint-disable jsx-a11y/alt-text -- o Image do react-pdf não tem alt (o PDF não é HTML) */
import "server-only";
import { Document, Font, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { formatCpf } from "@/lib/br";
import { formatDate, gameLabel } from "@/lib/labels";
import { SNAP_CUTOFF } from "@/lib/snap-iv";
import type { GeneralText, SummaryText } from "./ai";
import type { ReportData } from "./data";
import {
  ATTENTION_THEORY,
  EXECUTIVE_THEORY,
  GAME_THEORY,
  GENERAL_TITLE,
  INSTRUMENT_TABLE,
  NON_DIAGNOSTIC,
  PROCEDURE_ITEMS,
  SUMMARY_TITLE,
} from "./texts";

// PDFs do relatório e da devolutiva, nas cores da plataforma. Fontes padrão do PDF (Helvetica),
// que dispensam arquivos de fonte no servidor.

// Sem hifenização automática (as regras embutidas são do inglês).
Font.registerHyphenationCallback((word) => [word]);

const C = { blue: "#3D8FCB", green: "#61C24E", cream: "#FBF3E3", ink: "#233A5C", muted: "#65758D", line: "#D9DEE5" };

const s = StyleSheet.create({
  page: { paddingTop: 92, paddingBottom: 56, paddingHorizontal: 56, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.5, color: C.ink },
  header: { position: "absolute", top: 28, left: 56, right: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottomWidth: 0.6, borderBottomColor: C.line },
  headerLogos: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { height: 30, objectFit: "contain" },
  headerName: { fontWeight: 700, fontSize: 11, color: C.blue },
  footer: { position: "absolute", bottom: 26, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.muted },
  watermark: { position: "absolute", top: 300, left: 172, width: 250, opacity: 0.06 },
  title: { fontWeight: 700, fontSize: 17, color: C.ink, textAlign: "center", marginBottom: 14 },
  h1: { fontWeight: 700, fontSize: 12.5, color: C.blue, marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  h2: { fontWeight: 700, fontSize: 11.5, color: C.ink, marginTop: 12, marginBottom: 5 },
  p: { marginBottom: 7, textAlign: "justify" },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  li: { flexDirection: "row", marginBottom: 4, paddingLeft: 6 },
  bullet: { width: 12, color: C.blue },
  table: { borderWidth: 0.6, borderColor: C.line, borderRadius: 4, marginVertical: 8 },
  tr: { flexDirection: "row", borderTopWidth: 0.6, borderTopColor: C.line },
  th: { flexDirection: "row", backgroundColor: "#EEF5FB" },
  td: { padding: 5, fontSize: 9.5, lineHeight: 1.35 },
  caption: { fontSize: 9, color: C.muted, marginTop: 6, textAlign: "center" },
  note: { backgroundColor: C.cream, borderRadius: 6, padding: 10, marginTop: 10, fontSize: 9.5 },
  small: { fontSize: 9, lineHeight: 1.4 },
  sign: { marginTop: 36, alignItems: "flex-start" },
  signLine: { width: 220, borderTopWidth: 0.6, borderTopColor: C.ink, marginBottom: 4 },
  // capa
  cover: { padding: 56, fontFamily: "Helvetica", color: C.ink, fontSize: 11, lineHeight: 1.5 },
  coverBand: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: C.blue },
  coverBandGreen: { position: "absolute", top: 8, left: 0, right: 0, height: 4, backgroundColor: C.green },
  coverLogos: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  coverLogo: { height: 56, objectFit: "contain" },
  coverTitle: { fontWeight: 700, fontSize: 20, lineHeight: 1.3, textAlign: "center", marginTop: 110, textTransform: "uppercase", color: C.ink },
  coverSubtitle: { fontSize: 13, textAlign: "center", marginTop: 8, color: C.blue },
  coverBox: { marginTop: 80, marginLeft: "35%", backgroundColor: C.cream, borderRadius: 8, padding: 14, fontSize: 10.5 },
  coverFoot: { position: "absolute", bottom: 56, left: 56, right: 56, alignItems: "center", fontSize: 10.5 },
});

// --- texto com marcação simples -------------------------------------------------------------

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <Text key={i} style={s.bold}>
        {part.slice(2, -2)}
      </Text>
    ) : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
      <Text key={i} style={s.italic}>
        {part.slice(1, -1)}
      </Text>
    ) : (
      part
    ),
  );
}

function Rich({ text, empty = "—" }: { text: string | null | undefined; empty?: string }) {
  const blocks = (text ?? "").replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return <Text style={s.p}>{empty}</Text>;
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <View key={i} style={{ marginBottom: 6 }}>
              {lines.map((l, j) => (
                <View key={j} style={s.li} wrap={false}>
                  <Text style={s.bullet}>•</Text>
                  <Text style={{ flex: 1 }}>{inline(l.replace(/^\s*[-•]\s+/, ""))}</Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={s.p}>
            {inline(lines.join(" "))}
          </Text>
        );
      })}
    </>
  );
}

function Table({ head, rows, widths }: { head: string[]; rows: (string | number | null | undefined)[][]; widths: number[] }) {
  const cell = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));
  return (
    <View style={s.table}>
      <View style={s.th} fixed>
        {head.map((h, i) => (
          <Text key={i} style={[s.td, s.bold, { width: `${widths[i]}%` }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.tr} wrap={false}>
          {r.map((v, j) => (
            <Text key={j} style={[s.td, { width: `${widths[j]}%` }, j === 0 ? s.bold : {}]}>
              {cell(v)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// --- moldura ----------------------------------------------------------------------------------

type Assets = { mascot: Buffer | null; qr: Buffer | null };

function Frame({ d, assets, children }: { d: ReportData; assets: Assets; children: ReactNode }) {
  return (
    <Page size="A4" style={s.page}>
      {assets.mascot && <Image src={assets.mascot} style={s.watermark} fixed />}
      <View style={s.header} fixed>
        <View style={s.headerLogos}>
          {d.institution.logo ? <Image src={d.institution.logo} style={s.headerLogo} /> : <Text style={s.headerName}>{d.institution.name}</Text>}
        </View>
        <View style={s.headerLogos}>
          {d.institution.partnerLogos.map((l, i) => (
            <Image key={i} src={l} style={s.headerLogo} />
          ))}
        </View>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text>
          {d.institution.name} · documento confidencial
        </Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

function Signature({ d }: { d: ReportData }) {
  return (
    <View style={s.sign} wrap={false}>
      <View style={s.signLine} />
      <Text style={s.bold}>{d.professional.name}</Text>
      <Text style={s.small}>Psicólogo(a){d.professional.crp ? ` · CRP ${d.professional.crp}` : ""}</Text>
    </View>
  );
}

function Notes({ notes }: { notes: string | null }) {
  if (!notes?.trim()) return null;
  return (
    <>
      <Text style={s.h2}>Notas adicionais do profissional</Text>
      <Rich text={notes} />
    </>
  );
}

const num = (v: unknown, digits = 2) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : typeof v === "string" && v.trim() ? v : null;

function lines(...parts: (string | null)[]) {
  const shown = parts.filter((p): p is string => Boolean(p && !p.endsWith(": —")));
  return shown.length ? shown.join("\n") : null;
}

function location(d: ReportData) {
  return d.settings?.location || [d.institution.city, d.institution.uf].filter(Boolean).join(" - ") || null;
}

function GameTable({ d }: { d: ReportData }) {
  const byTest = new Map(d.session?.results.map((r) => [r.test, r]));
  return (
    <Table
      head={["Tarefa / jogo", "Acertos", "Erros", "Taxa de acerto"]}
      widths={[40, 18, 18, 24]}
      rows={[
        ...(["gonogo", "tmt_a", "tmt_b", "genius", "stroop"] as const).map((t) => {
          const r = byTest.get(t);
          return [gameLabel[t], r?.hits ?? null, r?.errors ?? null, r?.hitRate === null || !r ? "não realizado" : `${num(r.hitRate, 1)}%`];
        }),
        ["Média global de precisão", "", "", d.session?.meanHitRate === null || !d.session ? "—" : `${num(d.session.meanHitRate, 1)}%`],
      ]}
    />
  );
}

function SnapTable({ d }: { d: ReportData }) {
  if (!d.snap) return null;
  const { inattention, hyperactivity } = d.snap.scores;
  return (
    <>
      <Table
        head={["SNAP-IV (responsáveis)", "Itens com “bastante” ou “demais”", "Média (0–3)"]}
        widths={[40, 35, 25]}
        rows={[
          ["Desatenção", `${inattention.count} de 9`, num(inattention.mean)],
          ["Hiperatividade/impulsividade", `${hyperactivity.count} de 9`, num(hyperactivity.mean)],
        ]}
      />
      <Text style={s.caption}>
        Respondido em {formatDate(d.snap.date)}. Ponto de corte usual: {SNAP_CUTOFF} de 9 itens por subescala. Questionário de rastreio, sem valor diagnóstico isolado.
      </Text>
    </>
  );
}

function PatientId({ d }: { d: ReportData }) {
  const p = d.patient;
  return (
    <Table
      head={["Identificação", ""]}
      widths={[30, 70]}
      rows={[
        ["Nome", p.full_name],
        ["Data de nascimento", `${formatDate(p.birthdate)} (${p.age} anos)`],
        ...(p.cpf ? [["CPF", formatCpf(p.cpf)]] : []),
        ["Sexo", p.gender],
        ["Escolaridade", [p.education, p.public_school === null ? null : p.public_school ? "escola pública" : "escola particular"].filter(Boolean).join(", ")],
        ["Responsáveis", d.guardians.join(", ") || null],
      ]}
    />
  );
}

// --- Relatório (summary) ----------------------------------------------------------------------

export function SummaryPdf({ d, text, notes, assets }: { d: ReportData; text: SummaryText; notes: string | null; assets: Assets }) {
  const date = d.session?.date ?? new Date().toISOString();
  const closing = d.settings?.closing_notes?.[0];
  return (
    <Document title={`${SUMMARY_TITLE} – ${d.patient.full_name}`} author={d.professional.name} language="pt-BR">
      <Page size="A4" style={s.cover}>
        <View style={s.coverBand} fixed />
        <View style={s.coverBandGreen} fixed />
        <View style={s.coverLogos}>
          {d.institution.logo ? <Image src={d.institution.logo} style={s.coverLogo} /> : assets.mascot ? <Image src={assets.mascot} style={s.coverLogo} /> : <View />}
          <View style={{ flexDirection: "row", gap: 12 }}>
            {d.institution.partnerLogos.map((l, i) => (
              <Image key={i} src={l} style={s.coverLogo} />
            ))}
          </View>
        </View>
        <Text style={s.coverTitle}>{SUMMARY_TITLE}</Text>
        {d.settings?.subtitle && <Text style={s.coverSubtitle}>{d.settings.subtitle}</Text>}
        <View style={s.coverBox}>
          {d.settings?.cover_text && <Text style={{ marginBottom: 8 }}>{d.settings.cover_text}</Text>}
          <Text>
            <Text style={s.bold}>Participante: </Text>
            {d.patient.full_name}
          </Text>
          {d.guardians.length > 0 && (
            <Text>
              <Text style={s.bold}>Responsáveis: </Text>
              {d.guardians.join(", ")}
            </Text>
          )}
          <Text>
            <Text style={s.bold}>Data da avaliação: </Text>
            {formatDate(date)}
          </Text>
        </View>
        <View style={s.coverFoot}>
          <Text style={s.bold}>{d.professional.name}</Text>
          <Text>Psicólogo(a){d.professional.crp ? ` · CRP ${d.professional.crp}` : ""}</Text>
          <Text style={{ marginTop: 12 }}>{[location(d), date.slice(0, 4)].filter(Boolean).join(" · ")}</Text>
        </View>
      </Page>

      <Frame d={d} assets={assets}>
        <Text style={s.h1}>1. Introdução</Text>
        <Rich text={text.introducao} />
        <Text style={s.h1}>2. Identificação do paciente</Text>
        <PatientId d={d} />
        <Text style={s.h1}>3. Apresentação e histórico clínico</Text>
        <Rich text={text.historico} />
        <SnapTable d={d} />
        <Text style={s.h1}>4. Análise de atenção e velocidade de processamento</Text>
        {d.session ? (
          <Text style={[s.small, { color: C.muted, marginBottom: 4 }]}>
            Sessão de jogo de {formatDate(d.session.date)}
            {d.session.sessionsCount > 1 ? ` (a mais recente de ${d.session.sessionsCount})` : ""}.
          </Text>
        ) : null}
        <GameTable d={d} />
        <Rich text={text.atencao} />
        <Text style={s.h1}>5. Análise de funções executivas e controle inibitório</Text>
        <Rich text={text.funcoes_executivas} />
        <Text style={s.h1}>6. Conclusão</Text>
        <Rich text={text.conclusao} />
        <View style={s.note} wrap={false}>
          <Text>{closing ? inline(`**Importante ressaltar que este documento:** ${closing}`) : inline(NON_DIAGNOSTIC)}</Text>
        </View>
        <Notes notes={notes} />
        <Signature d={d} />
      </Frame>
    </Document>
  );
}

// --- Devolutiva (general) ---------------------------------------------------------------------

export function GeneralPdf({ d, text, notes, assets }: { d: ReportData; text: GeneralText; notes: string | null; assets: Assets }) {
  const st = d.settings;
  const nps = d.neuro.neupsilin?.scores ?? {};
  const tav = d.neuro.tavis?.scores ?? {};
  const fdt = d.neuro.fdt?.scores ?? {};
  const z = (k: string) => (num(nps[`${k}_zscore`]) ? `Z: ${num(nps[`${k}_zscore`])}` : null);
  const tavis = (t: string) => lines(`Acertos: ${num(tav[`${t}_acertos`]) ?? "—"}`, `Omissões: ${num(tav[`${t}_erros_omissao`]) ?? "—"}`, `Ações: ${num(tav[`${t}_erros_acao`]) ?? "—"}`);
  const fdtScore = (k: string) => lines(`Pc: ${num(fdt[`${k}_tempo_percentil`]) ?? "—"}`, `Z: ${num(fdt[`${k}_tempo_zscore`]) ?? "—"}`);
  const fdtErr = (k: string) => (num(fdt[`${k}_erros`]) !== null ? `Erros: ${num(fdt[`${k}_erros`])}` : null);

  let n = 0;
  const sec = (title: string) => `${++n}. ${title}`;

  return (
    <Document title={`${GENERAL_TITLE} – ${d.patient.full_name}`} author={d.professional.name} language="pt-BR">
      <Frame d={d} assets={assets}>
        <Text style={s.title}>{GENERAL_TITLE}</Text>
        {st?.subtitle && <Text style={[s.coverSubtitle, { marginTop: -8, marginBottom: 12 }]}>{st.subtitle}</Text>}
        {st?.intro_text && <Rich text={st.intro_text} />}

        <Text style={s.h1}>{sec("Identificação do profissional")}</Text>
        <Text style={s.p}>
          <Text style={s.bold}>Nome: </Text>
          {d.professional.name}
          {d.professional.crp ? ` – CRP ${d.professional.crp}` : ""}. Psicólogo(a) responsável pela avaliação.
        </Text>

        <Text style={s.h1}>{sec("Identificação do paciente")}</Text>
        <PatientId d={d} />
        <Text style={[s.small, { color: C.muted }]}>Documento elaborado em {new Date().getFullYear()}.</Text>

        {st?.study_description && (
          <>
            <Text style={s.h1}>{sec("Descrição do estudo")}</Text>
            <Rich text={st.study_description} />
          </>
        )}

        <Text style={s.h1}>{sec("Procedimentos")}</Text>
        {st?.procedures_text && <Rich text={st.procedures_text} />}
        <Rich text={PROCEDURE_ITEMS.map((i) => `- ${i}`).join("\n")} />
        <Table head={["Função cognitiva", "Testes padronizados, técnicas e paradigmas experimentais"]} widths={[28, 72]} rows={INSTRUMENT_TABLE} />
        <Text style={s.caption}>Tabela 1 – Relação entre função cognitivo-comportamental e os testes/técnicas/paradigmas empregados.</Text>

        <Text style={s.h1}>{sec("Análise")}</Text>
        <Text style={s.h2}>Histórico clínico</Text>
        <Rich text={text.historico} />
        <SnapTable d={d} />
        <Text style={s.h2}>Apresentação ao longo da avaliação</Text>
        <Rich text={text.apresentacao} />

        <Text style={s.h2}>Atenção (1)</Text>
        <Rich text={ATTENTION_THEORY} />
        <Text style={[s.p, s.bold]}>Os resultados da avaliação quantitativa das habilidades atencionais indicam:</Text>
        <Table
          head={["Habilidade", "Teste", "Pontuação (Z/Pc)", "Classificação"]}
          widths={[27, 25, 26, 22]}
          rows={[
            ["Atenção geral", "NEUPSILIN-Inf (total)", z("atencao"), num(nps.atencao_classificacao)],
            ["Atenção visual (cancelamento)", "NEUPSILIN-Inf", z("atencao_visual_cancelamento"), num(nps.atencao_visual_cancelamento_classificacao)],
            ["Velocidade de proc. visual", "NEUPSILIN-Inf (tempo)", z("atencao_visual_cancelamento_tempo"), num(nps.atencao_visual_cancelamento_tempo_classificacao)],
            ["Atenção auditiva", "NEUPSILIN-Inf", z("atencao_auditiva_digitos"), num(nps.atencao_auditiva_digitos_classificacao)],
            ["Atenção visual seletiva", "TAVIS-4 (tarefa 1)", tavis("t1"), num(tav.t1_tempo_reacao_medio) && `TMR: ${num(tav.t1_tempo_reacao_medio)}`],
            ["Atenção visual alternada", "TAVIS-4 (tarefa 2)", tavis("t2"), num(tav.t2_tempo_reacao_medio) && `TMR: ${num(tav.t2_tempo_reacao_medio)}`],
            ["Atenção sustentada", "TAVIS-4 (tarefa 3)", tavis("t3"), num(tav.t3_tempo_reacao_medio) && `TMR: ${num(tav.t3_tempo_reacao_medio)}`],
            ["Leitura (automática)", "FDT – Leitura", fdtScore("leitura"), fdtErr("leitura")],
            ["Contagem (automática)", "FDT – Contagem", fdtScore("contagem"), fdtErr("contagem")],
          ]}
        />
        <Text style={[s.p, s.bold]}>Análise qualitativa:</Text>
        <Rich text={text.atencao} />

        <Text style={s.h2}>Funções executivas (2)</Text>
        <Rich text={EXECUTIVE_THEORY} />
        <Text style={[s.p, s.bold]}>Os resultados quantitativos da avaliação das funções executivas indicam:</Text>
        <Table
          head={["Habilidade", "Teste – subteste", "Pontuação (Z/Pc)", "Classificação"]}
          widths={[27, 25, 26, 22]}
          rows={[
            ["Memória de trabalho (total)", "NEUPSILIN-Inf", z("memoria_trabalho"), num(nps.memoria_trabalho_classificacao)],
            ["Componente fonológico", "NEUPSILIN-Inf", z("memoria_trabalho_fonologico_executivo"), num(nps.memoria_trabalho_fonologico_executivo_classificacao)],
            ["Memória visuoespacial", "NEUPSILIN-Inf", z("memoria_trabalho_visuoespacial_inversa"), num(nps.memoria_trabalho_visuoespacial_inversa_classificacao)],
            ["Escolha (tomada de decisão)", "FDT – Escolha", fdtScore("escolha"), fdtErr("escolha")],
            ["Inibição", "FDT – Inibição", fdtScore("inibicao"), null],
            ["Alternância", "FDT – Alternância", fdtScore("alternancia"), fdtErr("alternancia")],
            ["Flexibilidade cognitiva", "FDT – Flexibilidade", fdtScore("flexibilidade"), null],
            ["Controle inibitório", "NEUPSILIN-Inf – Go/No-Go", z("gonogo"), num(nps.gonogo_classificacao)],
          ]}
        />
        <Text style={[s.p, s.bold]}>Análise qualitativa:</Text>
        <Rich text={text.funcoes_executivas} />

        <Text style={s.h2}>Desempenho no jogo MindFocus – análise idiográfica (3)</Text>
        <Rich text={GAME_THEORY} />
        <Text style={[s.p, s.bold]}>Resultados da análise idiográfica (taxa de acerto por jogo):</Text>
        <GameTable d={d} />
        <Text style={[s.p, s.bold]}>Análise qualitativa:</Text>
        <Rich text={text.jogo} />

        <Text style={s.h1}>{sec("Conclusão")}</Text>
        <Rich text={text.conclusao} />
        <Notes notes={notes} />

        <View style={[s.note, s.small]} wrap={false}>
          {st?.ethics_statement && (
            <Text style={{ marginBottom: 6 }}>
              <Text style={s.bold}>Declaração ética e de responsabilidade: </Text>
              {st.ethics_statement}
            </Text>
          )}
          <Text style={s.bold}>Importante ressaltar que este documento:</Text>
          {(st?.closing_notes?.length ? st.closing_notes : [NON_DIAGNOSTIC.replace(/^\*\*[^*]+\*\*\s*/, "")]).map((c, i) => (
            <Text key={i}>
              {i + 1}. {c}
            </Text>
          ))}
        </View>
        <Signature d={d} />

        {st?.references_url && assets.qr && (
          <View wrap={false}>
            <Text style={s.h1}>{sec("Referências bibliográficas")}</Text>
            <View style={{ alignItems: "center" }}>
              <Image src={assets.qr} style={{ width: 110, height: 110 }} />
              <Link src={st.references_url} style={[s.small, { color: C.blue }]}>
                Abrir a lista de referências
              </Link>
            </View>
          </View>
        )}
      </Frame>
    </Document>
  );
}
