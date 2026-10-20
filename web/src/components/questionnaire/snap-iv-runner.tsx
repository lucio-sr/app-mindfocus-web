"use client";

import { ArrowLeft, Check, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SNAP_ITEMS, SNAP_OPTIONS } from "@/lib/snap-iv";

type Answer = 0 | 1 | 2 | 3;

// Aplicação do SNAP-IV: uma frase por tela, botões grandes (celular/tablet), revisão antes de enviar.
// `onSubmit` devolve uma mensagem de erro ou null em caso de sucesso.
export function SnapIvRunner({
  childName,
  onSubmit,
}: {
  childName: string;
  onSubmit: (answers: { items: Answer[] }, startedAt: string) => Promise<string | null>;
}) {
  const startedAt = useRef(new Date().toISOString());
  const [answers, setAnswers] = useState<(Answer | null)[]>(() => SNAP_ITEMS.map(() => null));
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const total = SNAP_ITEMS.length;
  const answered = answers.filter((a) => a !== null).length;

  function choose(value: Answer) {
    const next = answers.map((a, i) => (i === index ? value : a));
    setAnswers(next);
    // pequena pausa para o toque aparecer marcado antes de avançar
    setTimeout(() => {
      if (returnToReview || index === total - 1) {
        setReturnToReview(false);
        setReviewing(true);
      } else setIndex(index + 1);
    }, 180);
  }

  async function submit() {
    if (answers.some((a) => a === null)) return;
    setLoading(true);
    setError(undefined);
    const message = await onSubmit({ items: answers as Answer[] }, startedAt.current);
    setLoading(false);
    if (message) setError(message);
  }

  if (reviewing) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-2xl font-extrabold">Confira as respostas</h2>
          <p className="mt-1 text-ink/65">Toque em uma frase para mudar a resposta.</p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <ol className="flex flex-col divide-y divide-ink/8 rounded-2xl border border-ink/10 bg-white">
          {SNAP_ITEMS.map((text, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setIndex(i);
                  setReturnToReview(true);
                  setReviewing(false);
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-cream/40"
              >
                <span className="mt-0.5 w-6 shrink-0 text-sm font-semibold text-ink/40 tabular-nums">{i + 1}</span>
                <span className="flex-1 text-sm">{text}</span>
                <span className="shrink-0 text-sm font-semibold text-brand-blue">
                  {answers[i] === null ? "—" : SNAP_OPTIONS[answers[i]!]}
                </span>
                <Pencil className="mt-0.5 size-3.5 shrink-0 text-ink/30" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        <Button onClick={submit} loading={loading} disabled={answered < total} variant="secondary" className="h-12 text-base">
          <Check className="size-5" aria-hidden /> Enviar respostas
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-ink/60">
          <span>
            Frase {index + 1} de {total}
          </span>
          <span>{Math.round((answered / total) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={total}>
          <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white p-6">
        <p className="text-sm font-medium text-ink/55">Quanto esta frase descreve {childName}?</p>
        <p className="mt-3 font-heading text-xl font-bold leading-snug sm:text-2xl">{SNAP_ITEMS[index]}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Resposta">
        {SNAP_OPTIONS.map((label, value) => {
          const selected = answers[index] === value;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(value as Answer)}
              className={`flex h-14 items-center justify-center rounded-2xl border-2 text-base font-semibold transition-colors ${
                selected ? "border-brand-blue bg-brand-blue text-white" : "border-ink/15 bg-white hover:border-brand-blue/50 hover:bg-brand-blue/5"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>
          <ArrowLeft className="size-4" aria-hidden /> Anterior
        </Button>
        {answered === total && (
          <Button variant="ghost" onClick={() => setReviewing(true)}>
            Revisar e enviar
          </Button>
        )}
      </div>
    </div>
  );
}
