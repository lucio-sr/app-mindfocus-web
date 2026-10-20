// Instrumentos neuropsicológicos tradicionais e os campos de escore de cada um.
//
// Os escores ficam em neuropsych_assessments.scores (jsonb) com chaves `${linha}_${coluna}`,
// iguais às colunas da base antiga sem o prefixo do instrumento (ex.: TAVIS "t1_acertos",
// FDT "leitura_tempo", NEUPSILIN "atencao_zscore"). Mudar uma chave aqui deixa os registros
// antigos sem aquele campo — prefira acrescentar.

export type InstrumentId = "tavis" | "fdt" | "neupsilin" | "other";
export type Scores = Record<string, number | string>;

type Column = { key: string; label: string; unit?: string; kind?: "number" | "text"; suggestions?: string[] };
type Row = { key: string; label: string; hint?: string; skip?: string[] };
export type ScoreTable = { title: string; description?: string; rows: Row[]; columns: Column[] };

export type Instrument = {
  id: InstrumentId;
  name: string;
  fullName: string;
  description: string;
  tables: ScoreTable[];
  // Campos calculados a partir de outros (não editáveis).
  computed?: Record<string, (s: Scores) => number | null>;
};

const num = (s: Scores, key: string) => (typeof s[key] === "number" ? (s[key] as number) : null);
const diff = (a: string, b: string) => (s: Scores) => {
  const x = num(s, a);
  const y = num(s, b);
  return x === null || y === null ? null : Math.round((x - y) * 100) / 100;
};

const CLASSIFICATIONS = ["Adequado", "Alerta", "Déficit"];

export const INSTRUMENTS: Instrument[] = [
  {
    id: "tavis",
    name: "TAVIS",
    fullName: "Teste de Atenção Visual",
    description: "Atenção seletiva, alternada e sustentada.",
    tables: [
      {
        title: "Tarefas",
        rows: [
          { key: "t1", label: "Tarefa 1", hint: "Atenção seletiva" },
          { key: "t2", label: "Tarefa 2", hint: "Atenção alternada" },
          { key: "t3", label: "Tarefa 3", hint: "Atenção sustentada" },
        ],
        columns: [
          { key: "tempo_reacao_medio", label: "Tempo de reação médio", unit: "ms" },
          { key: "acertos", label: "Acertos" },
          { key: "erros_omissao", label: "Erros por omissão" },
          { key: "erros_acao", label: "Erros por ação" },
        ],
      },
    ],
  },
  {
    id: "fdt",
    name: "FDT",
    fullName: "Teste dos Cinco Dígitos",
    description: "Velocidade de processamento, inibição e flexibilidade cognitiva.",
    tables: [
      {
        title: "Etapas",
        rows: [
          { key: "leitura", label: "Leitura", hint: "Processo automático" },
          { key: "contagem", label: "Contagem", hint: "Processo automático" },
          { key: "escolha", label: "Escolha", hint: "Processo controlado" },
          { key: "alternancia", label: "Alternância", hint: "Processo controlado" },
        ],
        columns: [
          { key: "tempo", label: "Tempo", unit: "s" },
          { key: "erros", label: "Erros" },
          { key: "percentil", label: "Percentil" },
        ],
      },
      {
        title: "Índices",
        description: "Tempos calculados automaticamente a partir das etapas.",
        rows: [
          { key: "inibicao", label: "Inibição", hint: "Escolha − Leitura" },
          { key: "flexibilidade", label: "Flexibilidade", hint: "Alternância − Leitura" },
        ],
        columns: [
          { key: "tempo", label: "Tempo", unit: "s" },
          { key: "percentil", label: "Percentil" },
        ],
      },
    ],
    computed: {
      inibicao_tempo: diff("escolha_tempo", "leitura_tempo"),
      flexibilidade_tempo: diff("alternancia_tempo", "leitura_tempo"),
    },
  },
  {
    id: "neupsilin",
    name: "NEUPSILIN-Inf",
    fullName: "Instrumento de Avaliação Neuropsicológica Breve Infantil",
    description: "Atenção e memória de trabalho (escore bruto, escore z e classificação).",
    tables: [
      {
        title: "Atenção",
        rows: [
          { key: "atencao", label: "Atenção (total)" },
          { key: "atencao_visual_cancelamento", label: "Cancelamento visual (acertos)" },
          { key: "atencao_visual_cancelamento_tempo", label: "Cancelamento visual (tempo)" },
          { key: "atencao_auditiva_digitos", label: "Repetição de dígitos" },
          { key: "gonogo", label: "Go/No-Go" },
        ],
        columns: [
          { key: "bruto", label: "Bruto" },
          { key: "zscore", label: "Escore z" },
          { key: "classificacao", label: "Classificação", kind: "text", suggestions: CLASSIFICATIONS },
        ],
      },
      {
        title: "Memória de trabalho",
        rows: [
          { key: "memoria_trabalho", label: "Memória de trabalho (total)" },
          { key: "memoria_trabalho_digitos_indireta", label: "Dígitos (ordem indireta)" },
          { key: "memoria_trabalho_fonologico_executivo", label: "Fonológica / executivo central" },
          { key: "memoria_trabalho_pseudopalavras", label: "Pseudopalavras" },
          { key: "memoria_trabalho_visuoespacial_inversa", label: "Visuoespacial (ordem inversa)" },
        ],
        columns: [
          { key: "bruto", label: "Bruto" },
          { key: "zscore", label: "Escore z" },
          { key: "classificacao", label: "Classificação", kind: "text", suggestions: CLASSIFICATIONS },
        ],
      },
    ],
  },
  {
    id: "other",
    name: "Outro",
    fullName: "Outro instrumento",
    description: "Registre o nome do instrumento, as observações e anexe o protocolo.",
    tables: [],
  },
];

export function getInstrument(id: string): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[INSTRUMENTS.length - 1];
}

export function instrumentLabel(id: string, name?: string | null): string {
  return id === "other" ? name || "Outro instrumento" : getInstrument(id).name;
}

export const scoreKey = (row: string, col: string) => `${row}_${col}`;

// Aceita vírgula decimal ("12,5"). Vazio → undefined (campo não preenchido).
export function parseScore(value: string, kind: "number" | "text" = "number"): number | string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (kind === "text") return v;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function formatScore(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : value;
}

// Escores + campos calculados.
export function withComputed(instrument: Instrument, scores: Scores): Scores {
  const out = { ...scores };
  for (const [key, fn] of Object.entries(instrument.computed ?? {})) {
    const v = fn(scores);
    if (v === null) delete out[key];
    else out[key] = v;
  }
  return out;
}

export function filledCount(scores: Scores): number {
  return Object.values(scores).filter((v) => v !== "" && v !== null && v !== undefined).length;
}
