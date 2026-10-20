// SNAP-IV, 18 itens (versão aplicada pelo chatbot antigo): 1–9 desatenção, 10–18 hiperatividade/impulsividade.
// Texto dos itens idêntico ao do chatbot antigo (instrumento validado: não reescrever).
// Respostas 0–3. A pontuação oficial é calculada no banco (private.snap_iv_score); aqui só exibimos.

export const SNAP_OPTIONS = ["Nem um pouco", "Só um pouco", "Bastante", "Demais"] as const;

export const SNAP_ITEMS = [
  "Não consegue prestar muita atenção a detalhes ou comete erros por descuido nos trabalhos da escola ou tarefas.",
  "Tem dificuldade de manter a atenção em tarefas ou atividades de lazer.",
  "Parece não estar ouvindo quando se fala diretamente com ele.",
  "Não segue instruções até o fim e não termina deveres de escola, tarefas ou obrigações.",
  "Tem dificuldade para organizar tarefas e atividades.",
  "Evita, não gosta ou se envolve contra a vontade em tarefas que exigem esforço mental prolongado.",
  "Distrai-se com estímulos externos.",
  "É esquecido em atividades do dia-a-dia.",
  "Perde coisas necessárias para atividades (p. ex: brinquedos, deveres da escola, lápis ou livros)",
  "Mexe com as mãos ou pés ou se remexe na cadeira.",
  "Não para ou frequentemente está a “mil por hora”.",
  "Fala em excesso.",
  "Tem dificuldade de esperar sua vez.",
  "Sai do lugar na sala de aula ou em outras situações em que se espera que fique sentado.",
  "Corre de um lado para outro ou sobe demais nas coisas em situações em que isto é inapropriado.",
  "Tem dificuldade em brincar ou envolver-se em atividades de lazer de forma calma.",
  "Responde as perguntas de forma precipitada antes delas terem sido terminadas.",
  "Interrompe os outros ou se intromete (por exemplo: intromete-se nas conversas, jogos, etc.)",
];

export const SNAP_SUBSCALES = [
  { key: "inattention", label: "Desatenção", range: [0, 9] },
  { key: "hyperactivity", label: "Hiperatividade/impulsividade", range: [9, 18] },
] as const;

// Itens marcados como "Bastante" ou "Demais" a partir dos quais a subescala é destacada no rastreio.
export const SNAP_CUTOFF = 6;

export type SnapScores = {
  inattention: { count: number; mean: number };
  hyperactivity: { count: number; mean: number };
  total_mean: number;
};

export const channelLabel: Record<string, string> = {
  link: "por link",
  in_person: "presencial",
  guardian_area: "área do responsável",
  legacy: "sistema antigo",
};
