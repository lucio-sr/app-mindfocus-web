"use client";

export type Delivery = "email" | "link" | "none";

const options: { value: Delivery; title: string; description: string; superadminOnly?: boolean }[] = [
  { value: "email", title: "Enviar convite por e-mail", description: "A pessoa recebe um link para criar a senha." },
  {
    value: "link",
    title: "Gerar link de convite",
    description: "O link aparece aqui para você enviar por outro meio (WhatsApp, por exemplo).",
    superadminOnly: true,
  },
  {
    value: "none",
    title: "Não enviar nada agora",
    description: "A pessoa cria a senha depois em “Esqueci minha senha”, com o CPF.",
  },
];

// Como uma conta nova recebe acesso (parâmetro `delivery` das Edge Functions).
// Contas que já existem só ganham o vínculo; nada é enviado.
export function DeliveryChoice({
  value,
  onChange,
  isPlatformAdmin,
}: {
  value: Delivery;
  onChange: (v: Delivery) => void;
  isPlatformAdmin: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Acesso da pessoa (se ainda não tiver conta)</legend>
      {options
        .filter((o) => isPlatformAdmin || !o.superadminOnly)
        .map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors ${
              value === o.value ? "border-brand-blue bg-brand-blue/5" : "border-ink/15 hover:bg-cream/50"
            }`}
          >
            <input
              type="radio"
              name="delivery"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 accent-brand-blue"
            />
            <span>
              <span className="block text-sm font-semibold">{o.title}</span>
              <span className="block text-sm text-ink/60">{o.description}</span>
            </span>
          </label>
        ))}
    </fieldset>
  );
}
