import "server-only";
import { gameLabel } from "@/lib/labels";
import { SNAP_CUTOFF } from "@/lib/snap-iv";
import type { ReportData } from "./data";

// Texto interpretativo dos documentos, redigido pela IA (OpenAI, como no sistema anterior).
//
// Privacidade: a IA nunca recebe nome, CPF, data de nascimento, renda nem dados dos responsáveis.
// Recebe idade, escolaridade, histórico e resultados; textos livres passam por `scrub`.

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export class AiUnavailableError extends Error {}

const DISCLAIMER =
  "Este documento não se constitui em um laudo técnico, tampouco tem por finalidade traçar o perfil psicológico ou comportamental da pessoa avaliada. " +
  "Expressa os dados qualitativos ou quantitativos traduzidos em medidas e conceitos objetivos que não esgotam a necessidade de uma maior compreensão " +
  "do significado do constructo avaliado, descrito no manual do instrumento.";

const FORMAT_RULES = `Formato de cada campo: texto corrido em português do Brasil; parágrafos separados por uma linha em branco;
destaques com **negrito**; listas com linhas começando por "- ". Não use títulos, tabelas, LaTeX nem HTML.
Refira-se ao paciente como "a criança" (você não recebe o nome). Não invente dados: se algo não foi realizado ou
respondido, diga isso. Nunca use a frase "com base nos testes apresentados"; use "com base nos instrumentos/tarefas apresentados".
Retorne APENAS um objeto JSON com as chaves pedidas, cada uma com uma string.`;

export const SUMMARY_KEYS = ["introducao", "historico", "atencao", "funcoes_executivas", "conclusao"] as const;
export const GENERAL_KEYS = ["historico", "apresentacao", "atencao", "funcoes_executivas", "jogo", "conclusao"] as const;
export type SummaryText = Record<(typeof SUMMARY_KEYS)[number], string>;
export type GeneralText = Record<(typeof GENERAL_KEYS)[number], string>;

const SUMMARY_PROMPT = `Você é um neuropsicólogo especialista redigindo um relatório de devolutiva focado no desempenho em jogos e tarefas neuropsicológicas.
Com base EXCLUSIVAMENTE nos dados fornecidos (idade, histórico, desempenho nos jogos Go/No-Go, TMT A e B, Genius e Stroop do MindFocus e,
se houver, o SNAP-IV respondido pelos responsáveis), escreva o conteúdo das seções abaixo.

${DISCLAIMER} (Tenha em mente essa frase como uma regra.)

Chaves do JSON:
- "introducao": texto introdutório e lista dos constructos avaliados (atenção, velocidade de processamento, funções executivas,
  controle inibitório, memória de trabalho, flexibilidade cognitiva), explicando bem o que cada um avalia; inclua a explicação clara de
  que este documento não é um laudo técnico e não traça perfil psicológico, servindo apenas como resultado de um instrumento específico.
- "historico": apresentação e histórico clínico (diagnósticos prévios, medicações, escolaridade, comportamento) e, se houver,
  o resultado do SNAP-IV (itens com "bastante" ou "demais" por subescala; o ponto de corte usual é ${SNAP_CUTOFF} de 9).
- "atencao": breve introdução e o desempenho de cada jogo com o nome em negrito, ex.: "**Go/No-Go:** ...". Faça o mesmo para o TMT A.
- "funcoes_executivas": mesma lógica para Stroop, TMT B, Genius e eventuais ressalvas do Go/No-Go.
- "conclusao": texto conclusivo.

${FORMAT_RULES}`;

const GENERAL_PROMPT = `Você é um neuropsicólogo redigindo as seções qualitativas de uma devolutiva de avaliação neuropsicológica.
Analise os dados fornecidos e retorne as chaves:
- "historico": parágrafo humanizado com histórico clínico e queixas.
- "apresentacao": parágrafo sobre o comportamento e o engajamento ao longo da avaliação (use apenas o que os dados permitem inferir).
- "atencao": análise interpretando os escores z, percentis e classificações de atenção (NEUPSILIN-Inf, FDT, TAVIS-4).
- "funcoes_executivas": análise das funções executivas e da memória de trabalho com base nos escores z e percentis.
- "jogo": análise idiográfica do desempenho nos jogos do MindFocus: comente as taxas de acerto (precisão) da criança comparada a ela
  mesma. NÃO use normas externas. Jogos não realizados não entram na média.
- "conclusao": fechamento global resumindo os achados dos testes, do jogo e, se houver, do SNAP-IV.

${DISCLAIMER} (Tenha em mente essa frase como uma regra.)

${FORMAT_RULES}`;

// Remove nomes (do paciente e dos responsáveis), e-mails, CPFs e telefones de textos livres.
export function scrub(text: string | null | undefined, names: string[]): string | null {
  if (!text) return null;
  let out = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]")
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "[documento]")
    .replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g, "[telefone]");
  const tokens = new Set(
    names.flatMap((n) => n.split(/\s+/)).filter((t) => t.length >= 3 && !/^(d[aeo]s?|e)$/i.test(t)),
  );
  for (const t of tokens) {
    out = out.replace(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[nome]");
  }
  return out;
}

const GAME_FIELDS: Record<string, string> = {
  omissionErrors: "erros_omissao",
  comissionErrors: "erros_comissao",
  ReactionTimeMean: "tempo_reacao_medio",
  timeBetweenElementClicksMean: "tempo_medio_entre_cliques",
  maxSeq: "maior_sequencia",
  collorErrors: "erros_cor",
  collorAndNameErrors: "erros_cor_e_nome",
  purposelessClicks: "cliques_sem_proposito",
};

function deidentified(d: ReportData) {
  const names = [d.patient.full_name, ...d.guardians];
  const p = d.patient;
  return {
    paciente: {
      idade_anos: p.age,
      sexo: p.gender,
      escolaridade: p.education,
      escola: p.public_school === null ? null : p.public_school ? "pública" : "particular",
      reprovacoes: p.school_failure ? p.school_failure_times : 0,
      abandonos_escolares: p.school_dropout ? p.school_dropout_times : 0,
      irmaos: p.siblings,
      diagnosticos_previos: [p.adhd_diagnosis && "TDAH", p.autism_diagnosis && "TEA"].filter(Boolean),
      medicacoes: p.medications.map((m) => scrub(m, names)),
      observacoes: scrub(p.notes, names),
    },
    jogo_mindfocus: d.session
      ? {
          sessoes_realizadas: d.session.sessionsCount,
          jogos: d.session.results.map((r) => ({
            jogo: gameLabel[r.test],
            acertos: r.hits,
            erros: r.errors,
            taxa_de_acerto_pct: r.hitRate,
            duracao_s: r.seconds,
            ...Object.fromEntries(
              Object.entries(GAME_FIELDS)
                .filter(([k]) => typeof r.metrics[k] === "number")
                .map(([k, label]) => [label, r.metrics[k]]),
            ),
          })),
          media_taxa_de_acerto_pct: d.session.meanHitRate,
        }
      : "A criança ainda não jogou.",
    snap_iv_responsaveis: d.snap
      ? {
          desatencao: { itens_bastante_ou_demais: d.snap.scores.inattention.count, de: 9, media: d.snap.scores.inattention.mean },
          hiperatividade_impulsividade: { itens_bastante_ou_demais: d.snap.scores.hyperactivity.count, de: 9, media: d.snap.scores.hyperactivity.mean },
          ponto_de_corte: SNAP_CUTOFF,
        }
      : "O SNAP-IV não foi respondido pelos responsáveis.",
  };
}

async function complete<K extends string>(system: string, data: unknown, keys: readonly K[]): Promise<Record<K, string>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AiUnavailableError("OPENAI_API_KEY não configurada");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(data) },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new AiUnavailableError(`OpenAI respondeu ${res.status}`);
  const body = await res.json();
  const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, typeof parsed[k] === "string" ? (parsed[k] as string).trim() : ""])) as Record<K, string>;
}

export function writeSummary(d: ReportData): Promise<SummaryText> {
  return complete(SUMMARY_PROMPT, deidentified(d), SUMMARY_KEYS);
}

export function writeGeneral(d: ReportData): Promise<GeneralText> {
  return complete(GENERAL_PROMPT, { ...deidentified(d), testes_neuropsicologicos: d.neuro }, GENERAL_KEYS);
}
